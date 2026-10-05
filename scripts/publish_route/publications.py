"""Curated publication candidates (data/medium-policy/publications.json). The router never invents entries.

An entry counts only if every required field is present and well typed; anything else is reported in `rejected` and
never matched. Matching is topic overlap (case-insensitive) and excludes publications known not to accept
AI-assisted work with disclosure (`accepts_ai_assisted_with_disclosure: false`).
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_PATH = REPO / "data" / "medium-policy" / "publications.json"
REQUIRED = ("name", "url", "topics", "submission_url", "editorial_review", "accepts_ai_assisted_with_disclosure", "source_url", "verified_at")


def _entry_problem(e) -> str | None:
    if not isinstance(e, dict):
        return "entry is not an object"
    for k in REQUIRED:
        if k not in e:
            return f"missing {k}"
    for k in ("name", "url", "submission_url", "source_url", "verified_at"):
        if not isinstance(e[k], str) or not e[k].strip():
            return f"{k} must be a non-empty string"
    if not (isinstance(e["topics"], list) and e["topics"] and all(isinstance(t, str) and t.strip() for t in e["topics"])):
        return "topics must be a non-empty list of strings"
    if e["editorial_review"] is not True:
        return "editorial_review must be true (human editors)"
    if e["accepts_ai_assisted_with_disclosure"] not in (True, False, "unknown"):
        return "accepts_ai_assisted_with_disclosure must be true, false or 'unknown'"
    return None


def load(path: Path = DEFAULT_PATH) -> dict:
    """{"version", "valid": [entries], "rejected": [{name, problem}]}. A missing or unreadable file is an empty list."""
    try:
        d = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {"version": None, "valid": [], "rejected": []}
    items = d.get("publications") if isinstance(d, dict) else None
    valid, rejected = [], []
    for e in items if isinstance(items, list) else []:
        p = _entry_problem(e)
        if p:
            rejected.append({"name": e.get("name") if isinstance(e, dict) else None, "problem": p})
        else:
            valid.append(e)
    return {"version": d.get("version") if isinstance(d, dict) else None, "valid": valid, "rejected": rejected}


def match(publications: list[dict], topics: list[str]) -> list[dict]:
    want = {t.strip().lower() for t in topics if isinstance(t, str) and t.strip()}
    out = []
    for e in publications:
        if e.get("accepts_ai_assisted_with_disclosure") is False:
            continue
        shared = sorted(want & {t.strip().lower() for t in e["topics"]})
        if not shared:
            continue
        note = "" if e["accepts_ai_assisted_with_disclosure"] is True else " AI-assisted policy unknown: verify the guidelines before submitting."
        out.append({"name": e["name"], "url": e["url"], "submission_url": e["submission_url"], "source_url": e["source_url"],
                    "verified_at": e["verified_at"], "accepts_ai_assisted_with_disclosure": e["accepts_ai_assisted_with_disclosure"],
                    "matched_topics": shared, "reason": f"topic overlap: {', '.join(shared)}; human editorial review.{note}"})
    return out
