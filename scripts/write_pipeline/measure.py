"""Optional paid-detector measurement of the exact FINAL bytes. Measurement only: nothing here gates, blocks or steers the draft.

Enabled when env WRITE_PIPELINE_DETECTOR names a detector and that detector is configured (see scripts.fingerprint_eval.detectors).
One score per FINAL hash: write-pipeline/detector/<name>-<sha12>.json. A failed call is recorded as unavailable and retried next run.
Flagged sentences feed the advisory detector corpus.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from scripts.fingerprint_eval import detector_corpus as DC
from scripts.fingerprint_eval import detectors as DET

from .core import atomic_write

ENV = "WRITE_PIPELINE_DETECTOR"
DIR = Path("write-pipeline") / "detector"


def _path(pkg: Path, name: str, sha: str) -> Path:
    return Path(pkg) / DIR / f"{name}-{sha[:12]}.json"


def run(pkg: Path, text: str, sha: str, env=None, transport=None, corpus: Path | None = None) -> dict | None:
    """The result dict (also on disk), or None when disabled or unconfigured. Never raises."""
    try:
        env = os.environ if env is None else env
        name = (env.get(ENV) or "").strip().lower()
        if not name:
            return None
        det = DET.get(name, env, transport)
        if det is None:
            return None
        path = _path(pkg, det.name, sha)
        try:
            cached = json.loads(path.read_text())
            if isinstance(cached, dict) and not cached.get("error"):
                return cached
        except (OSError, ValueError):
            pass
        res = det.score(text).to_dict()
        atomic_write(path, (json.dumps(res, indent=1, sort_keys=True) + "\n").encode())
        if not res.get("error"):
            try:
                DC.ingest_result(det.name, res, sha, corpus)
            except (OSError, ValueError):
                pass
        return res
    except Exception:  # noqa: BLE001  measurement must never block the package
        return None


def section_lines(pkg: Path, sha: str) -> list[str]:
    files = sorted((Path(pkg) / DIR).glob(f"*-{sha[:12]}.json")) if sha else []
    if not files:
        return ["- not run (optional, measurement only)"]
    out = ["- MEASUREMENT ONLY: never a gate, never a target to optimize against; learn patterns from the flagged sentences."]
    for f in files:
        try:
            r = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        if r.get("error"):
            out.append(f"- {r.get('name')}: unavailable ({r['error']})")
            continue
        out.append(f"- {r.get('name')} {r.get('version')} (scored {r.get('scored_at')}, bound to FINAL.md {str(r.get('text_sha256'))[:12]}): "
                   f"AI {r.get('ai_prob')}, mixed {r.get('mixed_prob')}, human {r.get('human_prob')}")
        out += [f"  - flagged: {s}" for s in r.get("flagged_sentences") or []] or ["  - flagged: none"]
    return out
