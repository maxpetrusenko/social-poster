"""Stage `fpverify`: final fingerprint verification, after critic and repair, before the integrity gate.

It measures the BASELINE (the first draft) and the FINAL candidate with the evaluator's own metrics (authorprofile.py): sentence and
paragraph regularity, structural repetition, n-gram repetition, list and rhetorical repetition, burstiness, author-corpus distance and
the template/em dash/transition signals. If significant signals remain it allows at most two targeted repair rounds. Each round is one
edit, re-measured, and kept only if the targeted signal improves, the total does not get worse, and the same guards as every other late
edit hold: no link lost, no number or claim changed or invented, three blocks at most, claims gate (with the evidence ledger and source
notes) PASS. No third-party detector is called or targeted.
"""
from __future__ import annotations

import json
from pathlib import Path

from . import addcheck as AC
from . import antifp as AF
from . import brief as BR
from . import fpcontract as CT
from . import editguard as G
from . import authorprofile as PF
from .core import BLOCKED, NOT_READY, Pipeline, PipelineError, atomic_write, sha_bytes
from .runs import candidate_text, ensure_source_notes, gate_reference_frame, reference_frame
from .submit import _finish, deps_ctx
from .validators import asserted_unresolved

MAX_ROUNDS = 2
DIR_REL = Path("write-pipeline") / "fpverify"
EPS = 0.001


def profile() -> dict:
    return PF.get_profile()


def _dir(pipe: Pipeline) -> Path:
    return pipe.pkg / DIR_REL


def _state(pipe: Pipeline) -> dict:
    st = pipe.state.get("fpverify")
    if not isinstance(st, dict):
        st = pipe.state["fpverify"] = {"rounds": 0}
    st.setdefault("rounds", 0)
    return st


def _loop(pipe: Pipeline) -> dict:
    try:
        return json.loads((_dir(pipe) / "loop.json").read_text())
    except (OSError, ValueError):
        return {}


def _save(pipe: Pipeline, loop: dict) -> None:
    atomic_write(_dir(pipe) / "loop.json", (json.dumps(loop, indent=1, sort_keys=True) + "\n").encode())


def baseline_text(pipe: Pipeline) -> str:
    return pipe.read_art("draft") or ""


def _current(pipe: Pipeline) -> tuple[str, dict]:
    """(current text, loop). A loop that does not belong to the current candidate, or whose current.md was edited on disk, restarts from the candidate."""
    cand = candidate_text(pipe)
    csha = sha_bytes(cand.encode())
    loop = _loop(pipe)
    cur = _dir(pipe) / "current.md"
    try:
        ok = loop.get("candidate_sha256") == csha and cur.exists() and sha_bytes(cur.read_bytes()) == loop.get("current_sha256")
    except OSError:
        ok = False
    if not ok:
        loop = {"candidate_sha256": csha, "current_sha256": csha, "attempts": []}
        atomic_write(cur, cand.encode())
        _save(pipe, loop)
    return cur.read_text(), loop


def can_measure(pipe: Pipeline) -> bool:
    return pipe.can_run("fpverify")[0] and not _brief_ok(pipe)


def _brief_ok(pipe: Pipeline) -> list[str]:
    return [] if BR.current_hash(pipe) else ["the brief stage is not DONE"]


def report(pipe: Pipeline, cur: str, loop: dict) -> dict:
    prof = profile()
    b, f = PF.evaluate(baseline_text(pipe), prof), PF.evaluate(cur, prof)
    bs = {r["signal"]: r for r in b["signals"]}
    fs = {r["signal"]: r for r in f["signals"]}
    deltas = [{"signal": k, "label": PF.SIGNALS[k]["label"], "baseline": bs[k]["value"], "final": fs[k]["value"], "delta": round(fs[k]["value"] - bs[k]["value"], 4),
               "baseline_severity": bs[k]["severity"], "final_severity": fs[k]["severity"], "band": fs[k]["band"]} for k in PF.SIGNALS if k in bs and k in fs]
    remaining = [r for r in f["signals"] if r["significant"]]
    debt = any((pipe.rec(st) or {}).get("fingerprint_debt") for st in ("draft", "editorial", "voice"))
    verdict = CT.assess(cur, debt)
    return {
        "contract": {"heavy": verdict["heavy"], "cap_violations": verdict["violations"], "owed": verdict["owed"], "composite": verdict["sig"]["composite"]},
        "policy": "own style-fingerprint metrics only (scripts.fingerprint_eval.metrics); no third-party AI detector was used or targeted",
        "author_corpus": {"docs": prof["n_docs"], "words": prof["n_words"]},
        "baseline": {"sha256": sha_bytes(baseline_text(pipe).encode()), "n_words": b["n_words"], "values": b["values"], "distance": b["distance"],
                     "signals": b["signals"], "total_severity": b["total_severity"]},
        "final": {"sha256": sha_bytes(cur.encode()), "n_words": f["n_words"], "values": f["values"], "distance": f["distance"], "signals": f["signals"],
                  "total_severity": f["total_severity"]},
        "changes": {"signals": deltas, "attempts": loop.get("attempts", []), "rounds_used": _state(pipe)["rounds"], "rounds_max": MAX_ROUNDS,
                    "kept": sum(1 for a in loop.get("attempts", []) if a.get("kept"))},
        "strongest_baseline": [r for r in b["signals"] if r["significant"]][:5],
        "strongest_remaining": remaining[:5],
        "remaining_significant": len(remaining),
        "author_voice": {"baseline_distance": b["distance"].get("composite"), "final_distance": f["distance"].get("composite"),
                         "components": {k: [b["distance"].get(k), f["distance"].get(k)] for k in ("sentence_length_jsd", "paragraph_length_jsd", "punctuation_jsd", "function_word_cosine")}},
    }


def view(pipe: Pipeline) -> dict:
    cur, loop = _current(pipe)
    rep = report(pipe, cur, loop)
    return {"ok": True, "current_file": str(DIR_REL / "current.md"), "rounds_used": rep["changes"]["rounds_used"], "rounds_left": MAX_ROUNDS - rep["changes"]["rounds_used"],
            "remaining_significant": rep["remaining_significant"], "strongest_remaining": rep["strongest_remaining"], "strongest_baseline": rep["strongest_baseline"],
            "author_distance": rep["author_voice"], "report": rep}


def run_fpverify(pipe: Pipeline) -> dict:
    """Measure. No significant signal left, or no repair round left: record the stage. Otherwise report what to target (stage stays pending)."""
    ok, why = pipe.can_run("fpverify")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "fpverify", "reasons": [why]}
    bad = _brief_ok(pipe)
    if bad:
        return {"ok": False, "code": "WAITING", "stage": "fpverify", "reasons": bad}
    v = view(pipe)
    if (v["remaining_significant"] or _contract_bad(v["report"])) and v["rounds_left"] > 0:
        return {**{k: v[k] for k in ("ok", "rounds_used", "rounds_left", "remaining_significant", "strongest_remaining", "author_distance", "current_file")},
                "stage": "fpverify", "done": False,
                "then": f"fpverify try --file F --signal <one of {sorted(PF.SIGNALS)}> (max {MAX_ROUNDS} rounds), or fpverify done to accept the remaining signals into PACKAGE.md"}
    return finish(pipe)


def _contract_bad(rep: dict) -> list[str]:
    """What the generation caps and antifp's heavy rule (fpcontract) still reject in the measured text. Remaining author-band signals are
    reported; these are never accepted."""
    c = rep["contract"]
    out = []
    if c["heavy"]:
        out.append(f"the text is heavy by the anti-fingerprint contract (composite {c['composite']}; heavy at template hits >= {CT.HEAVY_TEMPLATE_HITS} or composite >= {CT.HEAVY_COMPOSITE})")
    out += [f"{x['signal']} {x['value']} exceeds the generation cap {x['cap']} while a stage carries fingerprint debt" for x in c["owed"]]
    return out


def finish(pipe: Pipeline) -> dict:
    ok, why = pipe.can_run("fpverify")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "fpverify", "reasons": [why]}
    bad = _brief_ok(pipe)
    if bad:
        return {"ok": False, "code": "WAITING", "stage": "fpverify", "reasons": bad}
    cur, loop = _current(pipe)
    rep = report(pipe, cur, loop)
    bad = _contract_bad(rep)
    if bad:  # one contract: fpverify cannot accept what the generation caps or antifp call heavy
        msg = ["fingerprint contract not met, fpverify cannot accept the remaining signals: " + "; ".join(bad)[:400]]
        pipe.set("fpverify", NOT_READY, reasons=msg, extra={"candidate_sha256": sha_bytes(candidate_text(pipe).encode())})
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": "fpverify", "reasons": msg, "done": True}
    raw = (json.dumps(rep, indent=1, sort_keys=True) + "\n").encode()
    out = _finish(pipe, "fpverify", cur.encode(), "md", report=raw, extra={"candidate_sha256": sha_bytes(candidate_text(pipe).encode())})
    return {**out, "done": True, "remaining_significant": rep["remaining_significant"], "strongest_remaining": rep["strongest_remaining"],
            "rounds_used": rep["changes"]["rounds_used"]}


def try_edit(pipe: Pipeline, text: str, signal: str, runner: G.Runner) -> dict:
    ok, why = pipe.can_run("fpverify")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "fpverify", "reasons": [why]}
    st = _state(pipe)
    if signal not in PF.SIGNALS:
        return {"ok": False, "kept": False, "reasons": [f"--signal must be one of {sorted(PF.SIGNALS)} (got {signal!r})"]}
    if st["rounds"] >= MAX_ROUNDS:
        return {"ok": False, "kept": False, "reasons": [f"the {MAX_ROUNDS} fingerprint repair rounds of this run are used; run 'fpverify done' (remaining signals are reported in PACKAGE.md)"]}
    cur, loop = _current(pipe)
    n_changed = AF.changed_blocks(cur, text)
    if n_changed == 0:
        return {"ok": False, "kept": False, "reasons": ["the edit is identical to the current text"]}
    prof = profile()
    before, after = PF.evaluate(cur, prof), PF.evaluate(text, prof)
    rec = {"n": len(loop["attempts"]) + 1, "round": st["rounds"] + 1, "signal": signal, "kept": False, "reasons": [], "candidate_sha256": sha_bytes(text.encode()),
           "value": [before["values"][signal], after["values"][signal]],
           "severity": {signal: [next(r["severity"] for r in before["signals"] if r["signal"] == signal), next(r["severity"] for r in after["signals"] if r["signal"] == signal)]},
           "total_severity": [before["total_severity"], after["total_severity"]]}
    if n_changed > AF.MAX_CHANGED_BLOCKS:
        rec["reasons"].append(f"edit is not local: {n_changed} blocks changed, the limit is {AF.MAX_CHANGED_BLOCKS} per round")
    c = deps_ctx(pipe)
    gate_ref = gate_reference_frame(pipe, text)
    if not rec["reasons"]:
        g = G.edit_guard(reference_frame(pipe, text), text, known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], strict=True, author_material=c["author_material"], ev=c["ev"])
        rec["reasons"] += ["guard: " + r for r in g["reasons"]]
        rec["reasons"] += asserted_unresolved(text, c["ev"])
        for b in AC.check_added(gate_ref, text, ev=c["ev"], blob=c["blob"], known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], author_material=c["author_material"])[:3]:
            rec["reasons"].append(f"edit adds or changes a sentence that fails a check {b['sentence'][:80]!r}: " + "; ".join(b["reasons"]))
    if not rec["reasons"]:
        v0, v1 = rec["value"]
        better = (v1 > v0 + EPS) if PF.SIGNALS[signal]["bad"] == "low" else (v1 < v0 - EPS)
        if not better:
            rec["reasons"].append(f"targeted signal {signal} did not improve ({v0} -> {v1}, {'higher' if PF.SIGNALS[signal]['bad'] == 'low' else 'lower'} is better); an edit is kept only if the signal moves toward the author's band")
        if after["total_severity"] > before["total_severity"] + EPS:
            rec["reasons"].append(f"the edit makes the overall fingerprint worse (total severity {before['total_severity']} -> {after['total_severity']})")
    gate_error = False
    if not rec["reasons"]:  # model gate last, only for an edit that already measures better
        base = _dir(pipe) / "work"
        atomic_write(base / "candidate" / "article.md", text.encode())
        atomic_write(base / "reference" / "reference.md", gate_ref.encode())
        notes = ensure_source_notes(pipe)
        gate = G.claims_gate(runner, base / "candidate" / "article.md", base / "reference" / "reference.md", base / "gate", pipe.pkg, notes=notes if notes.exists() else None)
        rec["claims_gate"] = gate["state"]
        if gate["state"] == "ERROR":
            rec["reasons"].append("claims gate could not evaluate (retry later): " + "; ".join(gate["reasons"])[:200])
            gate_error = True
        elif gate["state"] != "PASS":
            rec["reasons"].append("claims gate failed (a claim changed or a link was lost): " + "; ".join(gate["reasons"])[:200])
    if gate_error:  # an infrastructure error never burns a round
        pipe.set("fpverify", BLOCKED, reasons=rec["reasons"], extra={"category": "MODEL_UNAVAILABLE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "kept": False, **rec}
    st["rounds"] += 1
    rec["kept"] = not rec["reasons"]
    loop["attempts"].append(rec)
    if rec["kept"]:
        atomic_write(_dir(pipe) / "current.md", text.encode())
        loop["current_sha256"] = rec["candidate_sha256"]
    _save(pipe, loop)
    pipe.log("fpverify_try", n=rec["n"], signal=signal, kept=rec["kept"])
    pipe.save()
    return {"ok": rec["kept"], **rec, "rounds_left": MAX_ROUNDS - st["rounds"]}
