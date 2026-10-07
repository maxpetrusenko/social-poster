"""Read-only BEFORE/AFTER comparison of a write-pipeline package, for the dashboard.

    python -m scripts.write_pipeline.compare --package <package dir> --out <fingerprint.json>

Measures the draft, voice and reference-frame stage texts and FINAL.md with the pipeline's own deterministic metrics
(fpcontract.signals and authorprofile.evaluate, the same calls fpv.report makes), diffs each earlier stage against FINAL at sentence
level, and lists the edits the pipeline kept and rejected. It never instantiates Pipeline and never writes into the package.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import sys
from pathlib import Path

from scripts.fingerprint_eval.textutil import split_sentences

from . import authorprofile as PF
from . import fpcontract as CT

SCHEMA = 1
STAGE_FILES = {
    "draft": "write-pipeline/artifacts/06-draft.md",
    "voice": "write-pipeline/artifacts/09-voice.md",
    "frame": "write-pipeline/artifacts/13-images.reference-frame.md",
    "final": "FINAL.md",
}


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _json(path: Path, default=None):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def sentences(md: str) -> list[str]:
    """Per block, so a block's trailing citation never glues to the next block's first sentence."""
    out: list[str] = []
    for block in md.replace("\r\n", "\n").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if block.startswith("#"):
            out.append(" ".join(block.split()))
            continue
        out.extend(split_sentences(block))
    return out


def measure_stage(text: str, prof: dict) -> dict:
    sig = CT.signals(text)
    ev = PF.evaluate(text, prof)
    return {
        "n_words": ev["n_words"],
        "contract": {"composite": sig["composite"], "values": {k: round(v, 4) for k, v in sig["values"].items()}},
        "author": {"values": {k: round(v, 4) for k, v in ev["values"].items()}, "distance": {k: round(v, 4) for k, v in ev["distance"].items()}},
    }


def _bad_direction() -> dict:
    bad = {"composite": "high"}
    for k in CT.signals("x")["values"]:
        bad[k] = "high"
    for k, spec in PF.SIGNALS.items():
        bad[k] = "low" if spec["bad"] == "low" else "high"
    return bad


def diff_ops(before: list[str], after: list[str]) -> list[dict]:
    ops = []
    for tag, a0, a1, b0, b1 in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
        ops.append({"op": tag, "a": before[a0:a1], "b": after[b0:b1]})
    return ops


def _edits(pkg: Path) -> dict:
    wp = pkg / "write-pipeline"
    state = _json(wp / "state.json", {}) or {}
    kept: list[dict] = []
    seen: set[str] = set()
    ledger = _json(wp / "removals-ledger.json", {}) or {}
    for e in ledger.get("entries", []) if isinstance(ledger, dict) else []:
        s = str(e.get("sentence", "")).strip()
        if s in seen:
            continue
        seen.add(s)
        row = {"stage": e.get("stage", ""), "sentence": s, "reason": e.get("reason", "")}
        if e.get("replacement"):
            row["replacement"] = e["replacement"]
        kept.append(row)
    for c in state.get("repair_cuts", []) or []:
        s = str(c.get("text", "")).strip()
        if s and s not in seen:
            seen.add(s)
            kept.append({"stage": "repair", "sentence": s, "reason": c.get("reason", "")})

    rejected: list[dict] = []
    try:
        lines = (wp / "log.jsonl").read_text().splitlines()
    except OSError:
        lines = []
    for line in lines:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("event") == "repair_rejected":
            rejected.append({"stage": "repair", "at": ev.get("at", ""), "reasons": [str(r) for r in ev.get("reasons", [])]})
    for name in ("antifp", "fpverify"):
        for a in (_json(wp / name / "loop.json", {}) or {}).get("attempts", []) or []:
            if a.get("kept") is False:
                reasons = [str(r) for r in a.get("reasons", [])] or [str(a.get("target", "rejected"))]
                rejected.append({"stage": name, "at": a.get("at", ""), "reasons": reasons})
    fr = state.get("fingerprint_rejections")
    items = fr.items() if isinstance(fr, dict) else enumerate(fr or [])
    for key, v in items:
        reasons = v.get("reasons") if isinstance(v, dict) else v
        if isinstance(reasons, str):
            reasons = [reasons]
        if isinstance(reasons, list) and reasons:
            rejected.append({"stage": "fingerprint", "at": str(key), "reasons": [str(r) for r in reasons]})
    return {"kept": kept, "rejected": rejected}


def compare(pkg: Path) -> dict:
    prof = PF.get_profile()
    texts = {}
    for stage, rel in STAGE_FILES.items():
        raw = (pkg / rel).read_bytes()
        texts[stage] = (rel, raw, raw.decode("utf-8", errors="replace"))
    stages = {}
    for stage, (rel, raw, text) in texts.items():
        stages[stage] = {"path": rel, "sha256": _sha(raw), **measure_stage(text, prof)}
    final_s = sentences(texts["final"][2])
    diffs = {s: {"ops": diff_ops(sentences(texts[s][2]), final_s)} for s in ("draft", "voice", "frame")}
    return {
        "schema": SCHEMA,
        "package_sha": _sha("".join(stages[s]["sha256"] for s in STAGE_FILES).encode()),
        "stages": stages,
        "bad_direction": _bad_direction(),
        "diffs": diffs,
        "edits": _edits(pkg),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.write_pipeline.compare")
    ap.add_argument("--package", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args(argv)
    try:
        doc = compare(a.package)
    except Exception as exc:  # noqa: BLE001 - the importer reads this; it must never abort an import
        print(f"compare failed: {exc}", file=sys.stderr)
        return 1
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
