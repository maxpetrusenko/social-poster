"""Provenance facts for the AI disclosure line. Every fact is derived from a hash-bound artifact; nothing is read from a flag or a log line, because
a log line or a state flag can be written by anything.

- outline_supplied: only from the human-stage artifact (03h-human.json): the stage is DONE, the artifact on disk hashes to the sha the state record
  holds for it, its status is "answered" and its outline_supplied is true.
- human_edit: always False. The only mechanism that adopts an author edit is `revalidate`, and it records no fact bound to an artifact hash: it
  replaces state["candidate"] (later overwritten by an accepted repair) and clears `user_modified` once it finishes. The long disclosure also freezes
  its sentence at the images stage, so a later "edited by me" would no longer match the verified text. Until a hash-bound human-edit record exists,
  the line never claims "edited by me".
- citations_checked: the validate stage is DONE.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from .core import DONE, PipelineError, safe_path, sha_bytes


@dataclass(frozen=True)
class Steps:
    outline_supplied: bool = False
    human_edit: bool = False
    citations_checked: bool = False


def outline_supplied(pipe) -> bool:
    """True only when the DONE human-stage artifact, re-hashed from disk now, matches the sha its state record holds and says the author supplied the outline."""
    if pipe.status("human") != DONE:
        return False
    rec = pipe.rec("human") or {}
    rel = rec.get("artifact")
    want = (rec.get("files") or {}).get(rel) if rel else None
    if not rel or not want:
        return False
    try:
        raw = safe_path(pipe.pkg, rel).read_bytes()
        if sha_bytes(raw) != want:
            return False
        data = json.loads(raw)
    except (OSError, ValueError, PipelineError):
        return False
    return isinstance(data, dict) and data.get("status") == "answered" and data.get("outline_supplied") is True


def steps(pipe) -> Steps:
    return Steps(outline_supplied=outline_supplied(pipe), human_edit=False, citations_checked=pipe.status("validate") == DONE)
