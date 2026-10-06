"""CLI-executed stages that call the existing modules: Medium review (stage 10), independent critic (13), safe repair (14)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Callable

from scripts.fingerprint_eval.gateway import GatewayError, extract_json

from . import addcheck as AC
from . import criticev as CE
from . import cuts as CT
from . import editguard as G
from . import furniture as FU
from . import mdlib as M
from . import rewrite as RW
from . import scoped as SC
from .core import BLOCKED, DONE, FAILED, NOT_READY, Pipeline, PipelineError, atomic_write, safe_path, sha_bytes, sha_json
from .submit import _finish, deps_ctx

Critic = Callable[[str], str]
MAX_CRITIC_ROUNDS = 3
MAX_REPAIR_REJECTS = 3
LIMIT = re.compile(r"rate.?limit|usage limit|session limit|quota|unavailable|overloaded|429", re.I)


def run_review(pipe: Pipeline, runner: G.Runner) -> dict:
    ok, why = pipe.can_run("review")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "review", "reasons": [why]}
    rec = pipe.rec("review")
    if rec and pipe.status("review") == DONE:
        return {"ok": True, "cached": True, "stage": "review", "bundle_sha256": rec["bundle_sha256"]}
    art = safe_path(pipe.pkg, (pipe.rec("antifp") or {})["artifact"])
    rc, out = runner([sys.executable, "-m", "scripts.medium_review", "review", "--package", str(pipe.pkg), "--article", str(art), "--json"])
    try:
        record = json.loads(out[out.index("{"):out.rindex("}") + 1])
    except ValueError:
        record = {}
    if rc != 0 or record.get("status") != "REVIEWED":
        msg = [f"medium review did not produce a record (rc={rc}): {str(record.get('error') or out)[-200:]}"]
        pipe.set("review", BLOCKED, reasons=msg, extra={"category": "MODEL_UNAVAILABLE" if LIMIT.search(msg[0]) else "DEPENDENCY_FAILURE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "review", "reasons": msg}
    if record.get("binding", {}).get("content_sha256") != sha_bytes(art.read_bytes()):
        return _fail_review(pipe, "review record is bound to different bytes than the anti-fingerprint output")
    keep = {k: record.get(k) for k in ("status", "binding", "scorecard", "hard_policy_risks", "warnings", "safe_auto_fixes", "author_input_required", "disclaimer")}
    return _finish(pipe, "review", (json.dumps(keep, indent=1, sort_keys=True) + "\n").encode(), "json")


def _fail_review(pipe: Pipeline, msg: str) -> dict:
    pipe.set("review", FAILED, reasons=[msg])
    pipe.save()
    return {"ok": False, "code": "INVALID", "stage": "review", "reasons": [msg]}


# ---- candidate ------------------------------------------------------------------------------------------------
def candidate_text(pipe: Pipeline) -> str:
    c = pipe.state.get("candidate") or {}
    if not c.get("path"):
        return ""
    raw = safe_path(pipe.pkg, c["path"]).read_bytes()
    if c.get("sha256") and sha_bytes(raw) != c["sha256"]:
        raise PipelineError("the candidate file changed on disk after it was accepted")
    return raw.decode("utf-8")


def raw_gate_reference(pipe: Pipeline) -> str:
    """The pre-anti-fingerprint reference exactly as the images stage recorded it. Never replaced by a rebase."""
    rec = pipe.rec("images") or {}
    if not rec.get("reference_frame"):
        return ""
    raw = safe_path(pipe.pkg, rec["reference_frame"]).read_bytes()
    if sha_bytes(raw) != rec.get("reference_frame_sha256"):
        raise PipelineError("the reference frame changed on disk after the images stage recorded it")
    return raw.decode("utf-8")


def repair_cuts(pipe: Pipeline) -> list[dict]:
    """Declared removals the repair stage accepted so far (signed state). Each is a sentence key plus its reason."""
    v = pipe.state.get("repair_cuts") if CT.repair_binding_ok(pipe) else None  # bound to the current reference and candidate lineage
    return [x for x in v if isinstance(x, dict) and isinstance(x.get("text"), str)] if isinstance(v, list) else []


def final_text(pipe: Pipeline) -> str:
    """The text that becomes FINAL.md: the fingerprint-verified text once fpverify is DONE, else the critic/repair candidate."""
    cand = candidate_text(pipe)  # also refuses a candidate file that changed on disk after it was accepted
    if pipe.status("fpverify") == DONE:
        rec = pipe.rec("fpverify") or {}
        if rec.get("candidate_sha256") != sha_bytes(cand.encode()):
            raise PipelineError("the fingerprint-verified text belongs to a different candidate than the current one")
        return pipe.read_art("fpverify") or cand
    return cand


def gate_reference_frame(pipe: Pipeline, cand: str | None = None) -> str:
    """The reference the evaluator gate compares against: the recorded pre-anti-fingerprint frame minus the sentences a repair
    declared as removals (taken out only while they are really gone from `cand`, default the current final text)."""
    ref = raw_gate_reference(pipe)
    cuts = repair_cuts(pipe)
    if not cuts or not ref:
        return ref
    out, _ = CT.apply_cuts(ref, cand if cand is not None else final_text(pipe), cuts)
    return out


def reference_frame(pipe: Pipeline, cand: str | None = None) -> str:
    """The reference the deterministic edit guard uses: the gate reference, or the author-approved rebase of it for the current candidate."""
    rb = pipe.state.get("rebase")
    if rb and CT.rebase_valid(pipe):
        raw = safe_path(pipe.pkg, rb["path"]).read_bytes()
        if sha_bytes(raw) != rb["new_reference_sha256"]:
            raise PipelineError("the rebased reference changed on disk after it was approved")
        return raw.decode("utf-8")
    return gate_reference_frame(pipe, cand)


NOTES_MARK = "<!-- write_pipeline source notes: sources plus evidence ledger -->\n"


def notes_text(pipe: Pipeline) -> str:
    c = deps_ctx(pipe)
    rows = []
    for cl in c["ev"].get("claims", []):
        if isinstance(cl, dict) and cl.get("status") != "unresolved":
            ps = " | ".join(str(e.get("passage")) for e in (cl.get("evidence") or []) if isinstance(e, dict) and e.get("passage"))
            rows.append(f"- [{cl.get('status')}] {cl.get('supported_wording') or cl.get('claim')}" + (f" (passages: {ps})" if ps else ""))
    return NOTES_MARK + c["blob"] + ("\n\n## Evidence ledger (claims the article may assert)\n\n" + "\n".join(rows) + "\n" if rows else "")


def ensure_source_notes(pipe: Pipeline) -> Path:
    """sources/source-notes.md for the gate's added-claim support check: the captured sources and the evidence ledger. An author-supplied
    notes file (no marker) is left exactly as it is."""
    p = pipe.pkg / "sources" / "source-notes.md"
    if p.exists() and not p.read_text(errors="ignore").startswith(NOTES_MARK):
        return p
    txt = notes_text(pipe)
    if not txt.strip() or not p.exists() or p.read_text(errors="ignore") != txt:
        if txt.strip():
            atomic_write(p, txt.encode())
    return p


CRITIC_PROMPT = """You are an independent editorial critic. You have no knowledge of how this article was produced. Judge only the text below.
Apply the editorial contract (V6 framework) that follows. Report findings only; do not rewrite the article.

Required furniture: the hero image and caption, the TLDR blockquote, the Read next line, the author bio and the pass-it-on line are REQUIRED by the
medium-article-generator skill. Never flag any of them for removal and never propose deleting one as a fix. You may still flag the CONTENT of the
TLDR (an unsupported claim, a number, a repeated thesis) and propose rewording it in place.

Severity: "major" = a factual claim the evidence does not support, an unsupported or invented personal experience, corrective-contrast or
other prohibited prose devices, a repeated thesis, a summary that adds nothing beyond its source, or a title that overclaims.
"minor" = anything else worth fixing. Quote the exact passage you refer to.

Before you call anything unsupported, verify it against the evidence ledger below. Each claim is listed with its evidence passages and the captured
source excerpts that bear on it. If a passage or excerpt states the fact (a quoted sentence, a number, a year, a study design, a sample size), it is
supported: do not report it. Report a claim as unsupported only when neither its evidence passages nor its source excerpts contain it, and say which
ledger id you checked and what is missing. A claim the ledger marks unresolved must not be asserted as fact.

Reply with JSON only: {{"verdict": "pass" | "revise", "findings": [{{"id": "F1", "severity": "major" | "minor", "kind": "unsupported" | "other", "passage": "<exact text from the article>", "claim_span": "<for kind unsupported: the exact words of the article that state the unsupported fact>", "reason": "...", "fix": "..."}}]}}
Use "pass" only when there is no major finding.

=== FRAMEWORK ===
{framework}

=== EVIDENCE LEDGER (claims, their evidence passages and source excerpts) ===
{ledger}

=== ARTICLE ===
{article}
"""

SCOPED_PROMPT = """You are the same independent editorial critic, now doing a SCOPED re-review, like an editor checking a revision. Apply the framework and the
severity rules of the first round. Required furniture (hero image and caption, TLDR, Read next, bio, pass-it-on) is never to be flagged for removal.
Do two things only.
(1) For each PRIOR OPEN FINDING below, say whether the revision resolved it: "resolved", "unresolved" or "not_applicable", with the evidence (what the
article now says, or why the finding no longer applies). A finding you do not answer counts as unresolved.
(2) Review ONLY the CHANGED BLOCKS below for problems the revision introduced. Do not raise findings about any other text: a new major whose passage
is not inside a changed block is downgraded to a minor suggestion automatically. Verify factual claims against the evidence ledger before calling them unsupported.

Reply with JSON only: {{"verdict": "pass" | "revise", "resolutions": [{{"id": "F1", "status": "resolved" | "unresolved" | "not_applicable", "evidence": "..."}}], "findings": [{{"id": "N1", "severity": "major" | "minor", "kind": "unsupported" | "other", "passage": "<exact text from a changed block>", "claim_span": "<for kind unsupported: the exact words>", "reason": "...", "fix": "..."}}]}}
"findings" lists NEW problems only. Use "pass" only when no prior finding is unresolved and no new major exists.

=== FRAMEWORK ===
{framework}

=== EVIDENCE LEDGER (claims, their evidence passages and source excerpts) ===
{ledger}

=== PRIOR OPEN FINDINGS (round {prior_round}) ===
{prior}

=== REPAIR REPORT (what changed since the last critic round) ===
{repair}

=== CHANGED BLOCKS (the only text you may raise new findings on) ===
{changed}

=== ARTICLE (for context) ===
{article}
"""


def captured_sources(pipe: Pipeline) -> list[CE.Source]:
    """(file, text) of every captured source, each re-hashed by deps_ctx's source_blob before it is ever shown to the critic."""
    src = pipe.read_json("source")
    out = []
    for x in (src.get("sources") or []) if isinstance(src, dict) else []:
        if x.get("status") == "captured" and x.get("file"):
            try:
                out.append((str(x["file"]), safe_path(pipe.pkg, x["file"]).read_bytes().decode("utf-8", "replace")))
            except (OSError, PipelineError):
                continue
    return out


def _ledger(ev: dict, sources: list[CE.Source] | None = None) -> str:
    """The ledger the critic sees: claims WITH their evidence passages and the relevant captured-source excerpts (criticev.ledger_view)."""
    return CE.ledger_view(ev, sources or [])


def run_critic(pipe: Pipeline, critic: Critic, framework_text: str) -> dict:
    ok, why = pipe.can_run("critic")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "critic", "reasons": [why]}
    cand = candidate_text(pipe)
    csha = sha_bytes(cand.encode())
    st = pipe.state.setdefault("critic", {"rounds": 0, "history": [], "repair_rejected": 0})
    rec = pipe.rec("critic")
    if rec and pipe.status("critic") == DONE and rec.get("candidate_sha256") == csha:
        return {"ok": True, "cached": True, "stage": "critic", "majors": rec.get("majors", 0), "round": st["rounds"]}
    last = st["history"][-1] if st["history"] else None
    if st["rounds"] >= MAX_CRITIC_ROUNDS:  # the budget belongs to the run: a resubmitted title, image, caption or fingerprint repair never refills it
        if last and last["majors"] > 0:
            return _critic_exhausted(pipe, st, csha=csha)
        if last and last.get("prose_sha256") == prose_sha(cand):  # same prose, only the frame changed: the last clean verdict still holds
            return _critic_carry(pipe, st, csha)
        return _critic_exhausted(pipe, st, "the critic budget is used and the prose changed after the last clean round; no further critic round is allowed", csha)
    ctx = deps_ctx(pipe)  # also re-hashes every captured source
    sources = captured_sources(pipe)
    scoped = bool(last and "block_hashes" in last)  # round 2+: prior open findings plus the changed blocks only
    changed = SC.changed_blocks(last["block_hashes"], cand) if scoped else []
    prior = [SC.open_record(f) for f in (last.get("open") or [])] if scoped else []
    if scoped:
        pt, ct = SC.scoped_input(prior, changed)
        cuts = [f"- removed: {c.get('text')!r} ({c.get('reason')})" + (f" -> rewritten as {c['replacement']!r}" if c.get("replacement") else "") for c in repair_cuts(pipe)]
        prompt = SCOPED_PROMPT.format(framework=framework_text, ledger=_ledger(ctx["ev"], sources), prior_round=last["round"], prior=pt,
                                      repair="\n".join(cuts) or "(no declared removals or rewrites)", changed=ct, article=cand)
    else:
        prompt = CRITIC_PROMPT.format(framework=framework_text, ledger=_ledger(ctx["ev"], sources), article=cand)
    try:
        raw = critic(prompt)
    except GatewayError as e:
        cat = getattr(getattr(e, "category", None), "value", "MODEL_UNAVAILABLE")
        msg = [f"critic model unavailable ({cat}): {str(e)[:200]}"]
        pipe.set("critic", BLOCKED, reasons=msg, extra={"category": cat})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "critic", "reasons": msg}
    except Exception as e:  # noqa: BLE001  an unexpected critic failure must not leave the stage pending
        msg = [f"critic failed unexpectedly ({type(e).__name__}): {str(e)[:200]}"]
        pipe.set("critic", BLOCKED, reasons=msg, extra={"category": "DEPENDENCY_FAILURE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "critic", "reasons": msg}
    try:
        data = extract_json(raw)
        findings = CE.furniture_filter(CE.rebut(_check_critic(data, cand, scoped=scoped), ctx["ev"], sources), cand)  # an "unsupported" major the evidence contains verbatim is rebutted; removal of required furniture is not_applicable
        if scoped:
            prior_f = SC.resolve(data, prior)
            findings = [*prior_f, *SC.scope_new(findings, changed, {f["id"] for f in prior_f})]
    except Exception as e:  # noqa: BLE001  malformed nested JSON of any shape is a rejected critic reply, not a crash
        pipe.set("critic", FAILED, reasons=[f"critic output is malformed: {str(e)[:200]}"])
        pipe.save()
        return {"ok": False, "code": "INVALID", "stage": "critic", "reasons": [f"critic output is malformed: {str(e)[:200]}"]}
    majors = [f for f in findings if f["severity"] == "major" and f["verified"]]
    st["rounds"] += 1
    st["repair_rejected"] = 0
    st["history"].append({"round": st["rounds"], "candidate_sha256": csha, "prose_sha256": prose_sha(cand), "majors": len(majors),
                          "block_hashes": SC.block_hashes(cand), "open": [SC.open_record(f) for f in majors]})
    art = {"round": st["rounds"], "scoped": scoped, "changed_blocks": len(changed), "candidate_sha256": csha, "reviewer": "claude -p (separate process, article and evidence only)", "verdict": "revise" if majors else "pass",
           "findings": findings, "majors": len(majors), "rebutted": sum(1 for f in findings if f["severity"] == "rebutted"),
           "not_applicable": sum(1 for f in findings if f["severity"] == "not_applicable"),
           "resolved": sum(1 for f in findings if f["severity"] == "resolved"), "suggestions": sum(1 for f in findings if f.get("suggestion"))}
    main = (json.dumps(art, indent=1, sort_keys=True) + "\n").encode()
    out = _finish(pipe, "critic", main, "json", extra_bundle=csha.encode(), extra={"candidate_sha256": csha, "majors": len(majors)})
    if majors and st["rounds"] >= MAX_CRITIC_ROUNDS:
        return _critic_exhausted(pipe, st, csha=csha)
    pipe.save()
    return {**out, "majors": len(majors), "round": st["rounds"], "findings": findings}


def prose_sha(text: str) -> str:
    """Hash of the article prose only: title, subtitle, image blocks and their captions are frame, not prose."""
    keep = []
    for b in M.blocks(M.body_without_frame(FU.split_footer(text)[0])):  # the frozen footer is boilerplate, not prose
        t = b.text.strip()
        if b.kind == "paragraph" and (t.startswith("![") or re.fullmatch(r"\*[^*\n]+\*", t)):
            continue
        keep.append(M.norm(t))
    return sha_bytes("\n".join(keep).encode())


def _critic_carry(pipe: Pipeline, st: dict, csha: str) -> dict:
    """Frame-only change after the budget was spent with a clean last round: record the same verdict for the new bytes, no model call."""
    prev = pipe.read_json("critic")
    art = {**prev, "candidate_sha256": csha, "carried_over": True, "note": "frame-only change (title, subtitle, images, captions); prose unchanged since the last clean critic round"}
    out = _finish(pipe, "critic", (json.dumps(art, indent=1, sort_keys=True) + "\n").encode(), "json", extra_bundle=csha.encode(), extra={"candidate_sha256": csha, "majors": 0})
    pipe.save()
    return {**out, "majors": 0, "round": st["rounds"], "carried_over": True}


def _critic_exhausted(pipe: Pipeline, st: dict, why: str | None = None, csha: str | None = None) -> dict:
    """Terminal NOT_READY, set by the CLI itself. The open findings stay in the critic artifact and are listed in PACKAGE.md."""
    open_n = st["history"][-1]["majors"] if st["history"] else 0
    msg = [why or f"critic loop budget ({MAX_CRITIC_ROUNDS} rounds per run) exhausted with {open_n} major finding(s) still open"]
    r = pipe.rec("critic") or {}
    pipe.set("critic", NOT_READY, bundle=r.get("bundle_sha256"), artifact=r.get("artifact"), reasons=msg, extra={"candidate_sha256": csha or r.get("candidate_sha256"), "majors": r.get("majors")})
    pipe.save()
    return {"ok": False, "code": "NOT_READY", "stage": "critic", "reasons": msg}


def _check_critic(data, cand: str, scoped: bool = False) -> list[dict]:
    if not isinstance(data, dict) or data.get("verdict") not in ("pass", "revise") or not isinstance(data.get("findings"), list):
        raise ValueError("expected {verdict, findings[]}")
    n, out = M.norm(cand), []
    for i, f in enumerate(data["findings"]):
        if not isinstance(f, dict) or f.get("severity") not in ("major", "minor") or not str(f.get("reason", "")).strip() or not str(f.get("passage", "")).strip():
            raise ValueError(f"finding {i} needs severity, passage and reason")
        out.append({"id": str(f.get("id") or f"F{i + 1}"), "severity": f["severity"], "kind": str(f.get("kind") or ""), "claim_span": str(f.get("claim_span") or ""),
                    "passage": f["passage"], "reason": f["reason"], "fix": f.get("fix", ""),
                    "verified": M.norm(str(f["passage"])) in n})  # a finding whose quoted passage is not in the article cannot be acted on
    if data["verdict"] == "revise" and not out and not scoped:
        raise ValueError("verdict 'revise' without findings")
    return out


# ---- repair -----------------------------------------------------------------------------------------------------
def _removals(report) -> tuple[list[dict], list[str]]:
    rem = (report or {}).get("removals") if isinstance(report, dict) else None
    out, bad = [], []
    for i, r in enumerate(rem if isinstance(rem, list) else []):
        if not isinstance(r, dict) or not str(r.get("text", "")).strip() or not str(r.get("reason", "")).strip():
            bad.append(f"removals[{i}] needs {{\"text\": \"<exact sentence>\", \"reason\": \"...\"}}")
        else:
            item = {"text": str(r["text"]), "reason": str(r["reason"])[:200]}
            if "replacement" in r:
                if not isinstance(r["replacement"], str) or not r["replacement"].strip():
                    bad.append(f"removals[{i}].replacement must be the new sentence text")
                    continue
                item["replacement"] = r["replacement"].strip()
            out.append(item)
    return out, bad


def repair_try(pipe: Pipeline, cand: str, runner: G.Runner, report: dict | None = None) -> dict:
    """An editorial repair may reword, cut and ADD sentences. Every added sentence is evaluated on its own (addcheck: numbers, links,
    invented experience, negation, hedges; then the evaluator's added-claim support check against the evidence ledger and source notes,
    inside the claims gate). Deleted material must be declared in the report's `removals` and is checked like an editorial cut.
    A lost link, a changed claim or an unsupported addition is rejected."""
    ok, why = pipe.can_run("repair")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "repair", "reasons": [why]}
    CT.prune(pipe)  # cuts from before an upstream rework never carry into this repair
    crit = pipe.read_json("critic")
    if pipe.status("critic") != DONE or not crit.get("majors"):
        return {"ok": False, "code": "USAGE", "stage": "repair", "reasons": ["no open major finding on the current candidate: run the critic, or 'repair done'"]}
    st = pipe.state.setdefault("critic", {"rounds": 0, "history": [], "repair_rejected": 0})
    new_rem, rem_bad = _removals(report)
    prior = repair_cuts(pipe)
    all_rem = [*prior, *[r for r in new_rem if CT._key(r["text"]) not in {CT._key(p["text"]) for p in prior}]]
    raw_gate, c = raw_gate_reference(pipe), deps_ctx(pipe)
    gate_ref, cuts = CT.apply_cuts(raw_gate, cand, all_rem)
    guard_ref = reference_frame(pipe, cand)
    undone = [r["text"][:80] for r in new_rem if CT._key(r["text"]) not in {x["sentence"] for x in cuts} and CT._key(r["text"]) not in {CT._key(p["text"]) for p in prior}]
    g = G.edit_guard(guard_ref, cand, known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], strict=True, removals=all_rem, author_material=c["author_material"], ev=c["ev"])
    reasons = [*rem_bad, *g["reasons"]]
    if not reasons:  # a link-bearing sentence may be rewritten only as a declared rewrite that keeps its URLs and is support-checked
        reasons += RW.check_rewrites(guard_ref, cand, all_rem, new_rem, ev=c["ev"], blob=c["blob"], known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], author_material=c["author_material"])
    if not reasons:  # policy rule (b): the claims of a removed link-bearing sentence must really be gone
        more, blocked = G.confirm_link_removals(g, runner, pipe.pkg, cand, pipe.pkg / "write-pipeline" / "work" / "repair-removed")
        if blocked:
            pipe.set("repair", BLOCKED, reasons=more, extra={"category": "MODEL_UNAVAILABLE"})
            pipe.save()
            return {"ok": False, "code": "BLOCKED", "stage": "repair", "reasons": more}
        reasons += more
    if undone:
        reasons.append(f"declared removals that do not match a reference sentence exactly, or are still in the text: {undone[:2]}")
    bad_added = AC.check_added(gate_ref, cand, ev=c["ev"], blob=c["blob"], known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], author_material=c["author_material"],
                             rewrite_keys=RW.rewrite_keys(new_rem))
    for b in bad_added[:4]:
        reasons.append(f"added sentence rejected [{b['section'] or 'intro'}] {b['sentence'][:100]!r}: " + "; ".join(b["reasons"]))
    added_n = len(AC.added_sentences(gate_ref, cand))
    gate_state = None
    if not reasons:
        base = pipe.pkg / "write-pipeline" / "work" / "repair"
        atomic_write(base / "candidate" / "article.md", cand.encode())
        atomic_write(base / "reference" / "reference.md", gate_ref.encode())
        notes = ensure_source_notes(pipe)
        gate = G.claims_gate(runner, base / "candidate" / "article.md", base / "reference" / "reference.md", base / "gate", pipe.pkg, notes=notes if notes.exists() else None)
        gate_state = gate["state"]
        if gate["state"] == "ERROR":
            msg = ["claims gate could not evaluate the repair (retry later): " + "; ".join(gate["reasons"])[:200]]
            pipe.set("repair", BLOCKED, reasons=msg, extra={"category": "MODEL_UNAVAILABLE"})
            pipe.save()
            return {"ok": False, "code": "BLOCKED", "stage": "repair", "reasons": msg}
        if gate["state"] != "PASS":
            reasons.append("claims gate failed: " + "; ".join(gate["reasons"])[:300])
            for u in gate.get("added_unsupported", [])[:3]:
                reasons.append(f"added claim unsupported by the evidence ledger and source notes: {str(u.get('claim'))[:120]!r}")
    if reasons:
        st["repair_rejected"] += 1
        pipe.log("repair_rejected", reasons=reasons[:3])
        if st["repair_rejected"] >= MAX_REPAIR_REJECTS:
            msg = [f"{MAX_REPAIR_REJECTS} repairs rejected: the critic's fix needs a claim change. Rework the article upstream (validate stage) instead of patching: " + reasons[0][:160]]
            pipe.set("repair", NOT_READY, reasons=msg)
            pipe.save()
            return {"ok": False, "code": "NOT_READY", "stage": "repair", "reasons": msg}
        pipe.save()
        return {"ok": False, "code": "INVALID", "stage": "repair", "reasons": reasons, "rejected": st["repair_rejected"], "added_sentences": added_n}
    n = len(pipe.state["candidate"].get("history", [])) + 1
    p = pipe.pkg / "write-pipeline" / "frame" / f"candidate-repair-{n}.md"
    atomic_write(p, cand.encode())
    pipe.state["candidate"] = {"path": str(p.relative_to(pipe.pkg)), "sha256": sha_bytes(cand.encode()), "origin": f"repair-{n}", "history": [*pipe.state["candidate"].get("history", []), pipe.state["candidate"]["sha256"]]}
    images_ref = CT.images_reference_sha(pipe) or ""
    reps = RW.replacements(all_rem)
    cuts = [{**x, "replacement": reps[x["sentence"]]} if x["sentence"] in reps else x for x in cuts]
    pipe.state["repair_cuts"] = [{"text": x["sentence"], "reason": x["reason"], **({"replacement": x["replacement"]} if x.get("replacement") else {})} for x in cuts]
    pipe.state["repair_cuts_binding"] = {"reference_sha256": images_ref, "candidate_sha256": pipe.state["candidate"]["sha256"]}
    CT.record_cuts(pipe, "repair", cuts, images_ref, pipe.state["candidate"]["sha256"])
    pipe.log("repair_accepted", sha256=pipe.state["candidate"]["sha256"], added=added_n, cuts=len(cuts))
    pipe.save()
    return {"ok": True, "code": "ACCEPTED", "stage": "repair", "candidate_sha256": pipe.state["candidate"]["sha256"], "reasons": [], "added_sentences": added_n,
            "removed_sentences": len(cuts), "claims_gate": gate_state, "next": "run critic on the repaired candidate"}


def repair_done(pipe: Pipeline) -> dict:
    if pipe.status("critic") != DONE:
        return {"ok": False, "code": "WAITING", "stage": "repair", "reasons": ["the critic has not reviewed the current candidate"]}
    crit = pipe.read_json("critic")
    if crit.get("majors"):
        return {"ok": False, "code": "USAGE", "stage": "repair", "reasons": [f"{crit['majors']} major finding(s) still open: use 'repair try'"]}
    cand = candidate_text(pipe)
    return _finish(pipe, "repair", cand.encode(), "md", extra_bundle=sha_json(crit).encode(), extra={"candidate_sha256": sha_bytes(cand.encode())})
