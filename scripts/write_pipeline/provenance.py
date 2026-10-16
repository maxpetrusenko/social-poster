"""Provenance facts for the AI disclosure line, derived from the package state and log. Nothing here is assumed: a human step counts only when
a fact for it was recorded, and a citation check only when the validate stage is DONE. There is no human stage yet, so `outline_supplied` and
`human_edit` are False unless something records them (state["provenance"][name] is True, or a log event {"event": "provenance_fact", "fact": name}).
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from .core import DONE, LOG_REL

HUMAN_FACTS = ("outline_supplied", "human_edit")


@dataclass(frozen=True)
class Steps:
    outline_supplied: bool = False
    human_edit: bool = False
    citations_checked: bool = False


def recorded_facts(pipe) -> set[str]:
    out: set[str] = set()
    prov = pipe.state.get("provenance")
    if isinstance(prov, dict):
        out |= {k for k in HUMAN_FACTS if prov.get(k) is True}
    try:
        lines = (pipe.pkg / LOG_REL).read_text().splitlines()
    except OSError:
        lines = []
    for ln in lines:
        try:
            e = json.loads(ln)
        except ValueError:
            continue
        if isinstance(e, dict) and e.get("event") == "provenance_fact" and e.get("fact") in HUMAN_FACTS:
            out.add(e["fact"])
    return out


def steps(pipe) -> Steps:
    facts = recorded_facts(pipe)
    return Steps(outline_supplied="outline_supplied" in facts, human_edit="human_edit" in facts, citations_checked=pipe.status("validate") == DONE)
