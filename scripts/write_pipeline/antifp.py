"""Stage 9: targeted anti-fingerprint loop on OUR OWN metrics (scripts.fingerprint_eval.metrics, no model, no network).

baseline -> strongest signals -> a local edit proposed by the agent -> re-measure -> keep the edit only if the targeted
signal and the composite both improve AND the claims/links gate holds. Third-party AI detectors are never called and never
used as a target; this module only reads the style fingerprint the evaluator already defines.
"""
from __future__ import annotations

import difflib
import json
from pathlib import Path

from scripts.fingerprint_eval import metrics as FM
from scripts.fingerprint_eval.textutil import core_markdown

from . import editguard as G
from . import mdlib as M
from .core import Pipeline, PipelineError, atomic_write, sha_bytes
from .validators import asserted_unresolved

MAX_ATTEMPTS = 12
MAX_CHANGED_BLOCKS = 3
EPS = 0.05
HEAVY_TEMPLATE_HITS = 4
HEAVY_COMPOSITE = 18.0
TRANSITION_FLOOR = 12.0  # transition_excess = transitions per 1k words minus this
ONE_SENTENCE_PARA_FLOOR = 0.45
WEIGHTS = {"template_hits": 3.0, "em_dash_per_1k": 1.0, "repeated_ngram": 50.0, "one_sentence_para_excess": 10.0, "transition_excess": 0.05}
DIR_REL = Path("write-pipeline") / "antifp"


def signals(text: str) -> dict:
    fp = FM.fingerprint(core_markdown(text))
    tmpl = fp["templates"]
    v = {
        "template_hits": float(sum(t["count"] for t in tmpl.values())),
        "em_dash_per_1k": float(fp["em_dash_per_1k"]),
        "repeated_ngram": float(fp["repeated_ngram_rate"]["mean"]),
        "one_sentence_para_excess": max(0.0, fp["one_sentence_para_rate"] - ONE_SENTENCE_PARA_FLOOR),
        "transition_excess": max(0.0, fp["transition_total_per_1k"] - TRANSITION_FLOOR),
    }
    return {"values": v, "composite": round(sum(WEIGHTS[k] * x for k, x in v.items()), 4),
            "templates": {k: {"count": t["count"], "examples": t["examples"]} for k, t in tmpl.items()}, "n_words": fp["n_words"]}


def ranking(sig: dict, top: int = 5) -> list[dict]:
    rows = [{"signal": k, "value": round(v, 4), "contribution": round(WEIGHTS[k] * v, 4)} for k, v in sig["values"].items() if v > 0]
    rows.sort(key=lambda r: -r["contribution"])
    for r in rows:
        if r["signal"] == "template_hits":
            r["where"] = [{"template": n, "examples": t["examples"]} for n, t in sorted(sig["templates"].items(), key=lambda kv: -kv[1]["count"])]
    return rows[:top]


def _dir(pipe: Pipeline) -> Path:
    return pipe.pkg / DIR_REL


def _loop(pipe: Pipeline) -> dict:
    try:
        return json.loads((_dir(pipe) / "loop.json").read_text())
    except (OSError, ValueError):
        return {}


def _save(pipe: Pipeline, loop: dict) -> None:
    atomic_write(_dir(pipe) / "loop.json", (json.dumps(loop, indent=1, sort_keys=True) + "\n").encode())


def _current(pipe: Pipeline, loop: dict) -> str:
    """current.md, but only if its bytes are exactly the last text the loop accepted (the baseline or a gated, kept try)."""
    raw = (_dir(pipe) / "current.md").read_bytes()
    if not loop.get("current_sha256") or sha_bytes(raw) != loop["current_sha256"]:
        raise PipelineError("antifp current.md does not match the hash of the last gated attempt (edited on disk without a gated 'try'); "
                            "submit the edit through 'antifp try', or rerun 'antifp baseline' to restart the loop from the reference")
    return raw.decode("utf-8")


def reference_text(pipe: Pipeline) -> str:
    return pipe.read_art("voice") or ""


def baseline(pipe: Pipeline) -> dict:
    ref = reference_text(pipe)
    ref_sha = sha_bytes(ref.encode())
    loop = _loop(pipe)
    intact = True
    try:
        _current(pipe, loop)
    except (OSError, ValueError, PipelineError):
        intact = False  # an un-gated disk edit is never resumed from: the loop restarts from the reference
    if loop.get("reference_sha") == ref_sha and intact:
        return {"ok": True, "resumed": True, **_view(pipe, loop)}
    sig = signals(ref)
    atomic_write(_dir(pipe) / "current.md", ref.encode())
    loop = {"reference_sha": ref_sha, "baseline": {"composite": sig["composite"], "values": sig["values"], "templates": sig["templates"]},
            "attempts": [], "kept": 0, "current_sha256": ref_sha}
    _save(pipe, loop)
    return {"ok": True, "resumed": False, **_view(pipe, loop)}


def _view(pipe: Pipeline, loop: dict) -> dict:
    cur = _current(pipe, loop)
    sig = signals(cur)
    return {"baseline_composite": loop["baseline"]["composite"], "current_composite": sig["composite"], "attempts": len(loop["attempts"]),
            "kept": loop["kept"], "strongest": ranking(sig), "current_file": str(DIR_REL / "current.md")}


def changed_blocks(a: str, b: str) -> int:
    x, y = [bl.text for bl in M.blocks(a)], [bl.text for bl in M.blocks(b)]
    sm = difflib.SequenceMatcher(None, x, y, autojunk=False)
    return sum(max(i2 - i1, j2 - j1) for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != "equal")


def try_edit(pipe: Pipeline, cand: str, target: str, runner: G.Runner, ctx: dict) -> dict:
    """ctx: known_urls, blob_numbers, author_material. Returns the attempt record; kept edits become current.md."""
    loop = _loop(pipe)
    if not loop:
        return {"ok": False, "kept": False, "reasons": ["run 'antifp baseline' first"]}
    if len(loop["attempts"]) >= MAX_ATTEMPTS:
        return {"ok": False, "kept": False, "reasons": [f"attempt budget ({MAX_ATTEMPTS}) used; run 'antifp finish'"]}
    if target not in WEIGHTS:
        return {"ok": False, "kept": False, "reasons": [f"--signal must be one of {sorted(WEIGHTS)} (got {target!r}); an edit changes at most {MAX_CHANGED_BLOCKS} blocks"]}
    try:
        cur = _current(pipe, loop)
    except (OSError, ValueError, PipelineError) as e:
        return {"ok": False, "kept": False, "reasons": [str(e)]}
    ref = reference_text(pipe)
    rec = {"n": len(loop["attempts"]) + 1, "target": target, "kept": False, "reasons": [], "candidate_sha256": sha_bytes(cand.encode())}
    before, after = signals(cur), signals(cand)
    rec["composite"] = [before["composite"], after["composite"]]
    rec["target_value"] = [before["values"][target], after["values"][target]]
    n_changed = changed_blocks(cur, cand)
    if n_changed == 0:
        rec["reasons"].append("candidate is identical to the current text: change at least one sentence of the targeted signal")
    elif n_changed > MAX_CHANGED_BLOCKS:
        rec["reasons"].append(f"edit is not local: {n_changed} blocks changed, the antifp limit is {MAX_CHANGED_BLOCKS} blocks per try (MAX_CHANGED_BLOCKS={MAX_CHANGED_BLOCKS}); send one local edit per try")
    if not rec["reasons"]:
        g = G.edit_guard(ref, cand, known_urls=ctx["known_urls"], blob_numbers=ctx["blob_numbers"], strict=True, author_material=ctx["author_material"], ev=ctx.get("ev"))
        if not g["ok"]:
            rec["reasons"] += ["guard: " + r for r in g["reasons"]]
            rec["guard_categories"] = g["categories"]
        if ctx.get("ev"):
            rec["reasons"] += asserted_unresolved(cand, ctx["ev"])
    if not rec["reasons"]:
        if not after["values"][target] < before["values"][target] - 1e-9:
            rec["reasons"].append(f"targeted signal {target} did not improve ({before['values'][target]:.3f} -> {after['values'][target]:.3f}); an edit is kept only if the signal drops")
        if not after["composite"] < before["composite"] - EPS:
            rec["reasons"].append(f"composite did not improve by more than {EPS} ({before['composite']} -> {after['composite']}); weights {WEIGHTS}; the loop ends heavy at template_hits >= {HEAVY_TEMPLATE_HITS} or composite >= {HEAVY_COMPOSITE}")
    if not rec["reasons"]:  # the model gate runs last and only for an edit that already measures better
        cpath = _dir(pipe) / "work" / "candidate" / "article.md"
        rpath = _dir(pipe) / "work" / "reference" / "reference.md"
        atomic_write(cpath, cand.encode())
        atomic_write(rpath, ref.encode())
        gate = G.claims_gate(runner, cpath, rpath, _dir(pipe) / "work" / "gate", pipe.pkg)
        rec["claims_gate"] = gate["state"]
        if gate["state"] == "ERROR":
            rec["reasons"].append("claims gate could not evaluate: " + "; ".join(gate["reasons"])[:200])
            rec["blocked"] = True
        elif gate["state"] != "PASS":
            rec["reasons"].append("claims gate failed: " + "; ".join(gate["reasons"])[:200])
    rec["kept"] = not rec["reasons"]
    loop["attempts"].append(rec)
    if rec["kept"]:
        atomic_write(_dir(pipe) / "current.md", cand.encode())
        loop["current_sha256"] = rec["candidate_sha256"]  # finish accepts exactly these bytes and no others
        loop["kept"] += 1
    _save(pipe, loop)
    pipe.log("antifp_try", **{k: rec[k] for k in ("n", "target", "kept")})
    return {"ok": rec["kept"], **rec}


def finish(pipe: Pipeline) -> dict:
    loop = _loop(pipe)
    if not loop:
        return {"ok": False, "reasons": ["run 'antifp baseline' first"]}
    try:
        cur = _current(pipe, loop)
    except (OSError, ValueError, PipelineError) as e:
        return {"ok": False, "reasons": [str(e)]}
    sig = signals(cur)
    heavy = sig["values"]["template_hits"] >= HEAVY_TEMPLATE_HITS or sig["composite"] >= HEAVY_COMPOSITE
    debts = {st: pipe.rec(st)["fingerprint_debt"] for st in ("draft", "editorial", "voice") if (pipe.rec(st) or {}).get("fingerprint_debt")}
    from . import fpcaps as FC  # late: fpcaps imports this module
    owed = FC.violations(sig, FC.caps()) if debts else []
    if owed:  # a stage accepted with fingerprint_debt must be clear of the caps by the end of this loop
        heavy = True
    report = {"policy": "own style-fingerprint metrics only; no third-party AI detector was used or targeted",
              "reference_sha256": loop["reference_sha"], "final_sha256": sha_bytes(cur.encode()),
              "baseline": {"composite": loop["baseline"]["composite"], "values": loop["baseline"]["values"]},
              "after": {"composite": sig["composite"], "values": sig["values"]},
              "attempts": loop["attempts"], "kept": loop["kept"], "rejected": len(loop["attempts"]) - loop["kept"],
              "remaining_signals": ranking(sig), "fingerprint_heavy": heavy,
              "thresholds": {"template_hits": HEAVY_TEMPLATE_HITS, "composite": HEAVY_COMPOSITE},
              "fingerprint_debt": {"stages": debts, "uncleared": owed}}
    return {"ok": True, "text": cur, "report": report, "heavy": heavy}
