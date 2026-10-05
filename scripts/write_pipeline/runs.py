"""CLI-executed stages that call the existing modules: Medium review (stage 10), independent critic (13), safe repair (14)."""
from __future__ import annotations

import json
import re
import sys
from typing import Callable

from scripts.fingerprint_eval.gateway import GatewayError, extract_json

from . import editguard as G
from . import mdlib as M
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


def gate_reference_frame(pipe: Pipeline) -> str:
    """The pre-anti-fingerprint reference the evaluator gate compares against. Never replaced by a rebase."""
    rec = pipe.rec("images") or {}
    if not rec.get("reference_frame"):
        return ""
    raw = safe_path(pipe.pkg, rec["reference_frame"]).read_bytes()
    if sha_bytes(raw) != rec.get("reference_frame_sha256"):
        raise PipelineError("the reference frame changed on disk after the images stage recorded it")
    return raw.decode("utf-8")


def reference_frame(pipe: Pipeline) -> str:
    """The reference the deterministic edit guard uses: the gate reference, or the author-approved rebase of it for the current candidate."""
    rb = pipe.state.get("rebase")
    cand = (pipe.state.get("candidate") or {}).get("sha256")
    if rb and rb.get("accepted") and rb.get("candidate_sha256") == cand:
        raw = safe_path(pipe.pkg, rb["path"]).read_bytes()
        if sha_bytes(raw) != rb["new_reference_sha256"]:
            raise PipelineError("the rebased reference changed on disk after it was approved")
        return raw.decode("utf-8")
    return gate_reference_frame(pipe)


CRITIC_PROMPT = """You are an independent editorial critic. You have no knowledge of how this article was produced. Judge only the text below.
Apply the editorial contract (V6 framework) that follows. Report findings only; do not rewrite the article.

Severity: "major" = a factual claim the evidence does not support, an unsupported or invented personal experience, corrective-contrast or
other prohibited prose devices, a repeated thesis, a summary that adds nothing beyond its source, or a title that overclaims.
"minor" = anything else worth fixing. Quote the exact passage you refer to.

Reply with JSON only: {{"verdict": "pass" | "revise", "findings": [{{"id": "F1", "severity": "major" | "minor", "passage": "<exact text from the article>", "reason": "...", "fix": "..."}}]}}
Use "pass" only when there is no major finding.

=== FRAMEWORK ===
{framework}

=== EVIDENCE LEDGER (claims and inspected sources) ===
{ledger}

=== ARTICLE ===
{article}
"""


def _ledger(ev: dict) -> str:
    rows = []
    for c in ev.get("claims", []):
        urls = ", ".join(str(e.get("url") or e.get("source_id")) for e in c.get("evidence", []) or [])
        rows.append(f"- [{c.get('status')}] {c.get('claim')} ({urls})")
    return "\n".join(rows) or "(none)"


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
    if st["rounds"] >= MAX_CRITIC_ROUNDS and last and last["majors"] > 0:
        return _critic_exhausted(pipe, st)
    prompt = CRITIC_PROMPT.format(framework=framework_text, ledger=_ledger(deps_ctx(pipe)["ev"]), article=cand)
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
        findings = _check_critic(data, cand)
    except Exception as e:  # noqa: BLE001  malformed nested JSON of any shape is a rejected critic reply, not a crash
        pipe.set("critic", FAILED, reasons=[f"critic output is malformed: {str(e)[:200]}"])
        pipe.save()
        return {"ok": False, "code": "INVALID", "stage": "critic", "reasons": [f"critic output is malformed: {str(e)[:200]}"]}
    majors = [f for f in findings if f["severity"] == "major" and f["verified"]]
    st["rounds"] += 1
    st["repair_rejected"] = 0
    st["history"].append({"round": st["rounds"], "candidate_sha256": csha, "majors": len(majors)})
    art = {"round": st["rounds"], "candidate_sha256": csha, "reviewer": "claude -p (separate process, article and evidence only)", "verdict": "revise" if majors else "pass",
           "findings": findings, "majors": len(majors)}
    main = (json.dumps(art, indent=1, sort_keys=True) + "\n").encode()
    out = _finish(pipe, "critic", main, "json", extra_bundle=csha.encode(), extra={"candidate_sha256": csha, "majors": len(majors)})
    if majors and st["rounds"] >= MAX_CRITIC_ROUNDS:
        return _critic_exhausted(pipe, st)
    pipe.save()
    return {**out, "majors": len(majors), "round": st["rounds"], "findings": findings}


def _critic_exhausted(pipe: Pipeline, st: dict) -> dict:
    msg = [f"critic loop budget ({MAX_CRITIC_ROUNDS}) exhausted with {st['history'][-1]['majors']} major finding(s) still open"]
    r = pipe.rec("critic") or {}
    pipe.set("critic", NOT_READY, bundle=r.get("bundle_sha256"), artifact=r.get("artifact"), reasons=msg, extra={"candidate_sha256": r.get("candidate_sha256"), "majors": r.get("majors")})
    pipe.save()
    return {"ok": False, "code": "NOT_READY", "stage": "critic", "reasons": msg}


def _check_critic(data, cand: str) -> list[dict]:
    if not isinstance(data, dict) or data.get("verdict") not in ("pass", "revise") or not isinstance(data.get("findings"), list):
        raise ValueError("expected {verdict, findings[]}")
    n, out = M.norm(cand), []
    for i, f in enumerate(data["findings"]):
        if not isinstance(f, dict) or f.get("severity") not in ("major", "minor") or not str(f.get("reason", "")).strip() or not str(f.get("passage", "")).strip():
            raise ValueError(f"finding {i} needs severity, passage and reason")
        out.append({"id": str(f.get("id") or f"F{i + 1}"), "severity": f["severity"], "passage": f["passage"], "reason": f["reason"], "fix": f.get("fix", ""),
                    "verified": M.norm(str(f["passage"])) in n})  # a finding whose quoted passage is not in the article cannot be acted on
    if data["verdict"] == "revise" and not out:
        raise ValueError("verdict 'revise' without findings")
    return out


# ---- repair -----------------------------------------------------------------------------------------------------
def repair_try(pipe: Pipeline, cand: str, runner: G.Runner) -> dict:
    ok, why = pipe.can_run("repair")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "repair", "reasons": [why]}
    crit = pipe.read_json("critic")
    if pipe.status("critic") != DONE or not crit.get("majors"):
        return {"ok": False, "code": "USAGE", "stage": "repair", "reasons": ["no open major finding on the current candidate: run the critic, or 'repair done'"]}
    st = pipe.state.setdefault("critic", {"rounds": 0, "history": [], "repair_rejected": 0})
    ref, c = reference_frame(pipe), deps_ctx(pipe)
    gate_ref = gate_reference_frame(pipe)
    g = G.edit_guard(ref, cand, known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], strict=True, author_material=c["author_material"])
    reasons = list(g["reasons"])
    if not reasons:
        base = pipe.pkg / "write-pipeline" / "work" / "repair"
        atomic_write(base / "candidate" / "article.md", cand.encode())
        atomic_write(base / "reference" / "reference.md", gate_ref.encode())
        gate = G.claims_gate(runner, base / "candidate" / "article.md", base / "reference" / "reference.md", base / "gate", pipe.pkg)
        if gate["state"] == "ERROR":
            msg = ["claims gate could not evaluate the repair (retry later): " + "; ".join(gate["reasons"])[:200]]
            pipe.set("repair", BLOCKED, reasons=msg, extra={"category": "MODEL_UNAVAILABLE"})
            pipe.save()
            return {"ok": False, "code": "BLOCKED", "stage": "repair", "reasons": msg}
        if gate["state"] != "PASS":
            reasons.append("claims gate failed: " + "; ".join(gate["reasons"])[:300])
    if reasons:
        st["repair_rejected"] += 1
        pipe.log("repair_rejected", reasons=reasons[:3])
        if st["repair_rejected"] >= MAX_REPAIR_REJECTS:
            msg = [f"{MAX_REPAIR_REJECTS} repairs rejected: the critic's fix needs a claim change. Rework the article upstream (validate stage) instead of patching: " + reasons[0][:160]]
            pipe.set("repair", NOT_READY, reasons=msg)
            pipe.save()
            return {"ok": False, "code": "NOT_READY", "stage": "repair", "reasons": msg}
        pipe.save()
        return {"ok": False, "code": "INVALID", "stage": "repair", "reasons": reasons, "rejected": st["repair_rejected"]}
    n = len(pipe.state["candidate"].get("history", [])) + 1
    p = pipe.pkg / "write-pipeline" / "frame" / f"candidate-repair-{n}.md"
    atomic_write(p, cand.encode())
    pipe.state["candidate"] = {"path": str(p.relative_to(pipe.pkg)), "sha256": sha_bytes(cand.encode()), "origin": f"repair-{n}", "history": [*pipe.state["candidate"].get("history", []), pipe.state["candidate"]["sha256"]]}
    pipe.log("repair_accepted", sha256=pipe.state["candidate"]["sha256"])
    pipe.save()
    return {"ok": True, "code": "ACCEPTED", "stage": "repair", "candidate_sha256": pipe.state["candidate"]["sha256"], "reasons": [], "next": "run critic on the repaired candidate"}


def repair_done(pipe: Pipeline) -> dict:
    if pipe.status("critic") != DONE:
        return {"ok": False, "code": "WAITING", "stage": "repair", "reasons": ["the critic has not reviewed the current candidate"]}
    crit = pipe.read_json("critic")
    if crit.get("majors"):
        return {"ok": False, "code": "USAGE", "stage": "repair", "reasons": [f"{crit['majors']} major finding(s) still open: use 'repair try'"]}
    cand = candidate_text(pipe)
    return _finish(pipe, "repair", cand.encode(), "md", extra_bundle=sha_json(crit).encode(), extra={"candidate_sha256": sha_bytes(cand.encode())})
