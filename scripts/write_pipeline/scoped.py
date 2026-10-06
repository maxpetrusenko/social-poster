"""Editor-style convergence for the critic loop.

Round 1 is a full review. Every later round is SCOPED: the critic marks each prior open finding resolved / unresolved / not_applicable with
evidence, and reviews only the blocks that changed since the last critic round. A new major whose passage is not inside a changed block is
downgraded here, deterministically, to a minor suggestion, so a fresh full read can never surface new majors on text the author did not touch.
A prior finding the critic does not answer counts as unresolved. READY needs zero open majors after the scoped round.
"""
from __future__ import annotations

import re

from . import furniture as FU
from . import mdlib as M
from .core import sha_bytes

DOWNGRADE_REASON = "unchanged text, outside scoped review"
RESOLUTIONS = ("resolved", "unresolved", "not_applicable")


def prose_blocks(cand: str) -> list[str]:
    """Raw text of each prose block (frame, image blocks, captions and the frozen footer excluded), in order."""
    out = []
    for b in M.blocks(M.body_without_frame(FU.split_footer(cand)[0])):
        t = b.text.strip()
        if t and not (b.kind == "paragraph" and (t.startswith("![") or re.fullmatch(r"\*[^*\n]+\*", t))):
            out.append(t)
    return out


def block_hashes(cand: str) -> list[str]:
    return [sha_bytes(M.norm(t).encode()) for t in prose_blocks(cand)]


def changed_blocks(prev_hashes: list[str], cand: str) -> list[str]:
    """Blocks of `cand` whose normalised text did not exist in the candidate of the last critic round."""
    seen = set(prev_hashes)
    return [t for t in prose_blocks(cand) if sha_bytes(M.norm(t).encode()) not in seen]


def open_record(f: dict) -> dict:
    return {k: str(f.get(k) or "") for k in ("id", "passage", "reason", "fix")}


def scoped_input(prior: list[dict], changed: list[str]) -> tuple[str, str]:
    p = "\n".join(f"- {f['id']}: passage {f['passage']!r}\n    problem: {f['reason']}\n    asked fix: {f['fix'] or '(none)'}" for f in prior) or "(none: all earlier findings are closed)"
    c = "\n\n".join(f"[changed block {i}]\n{t}" for i, t in enumerate(changed, 1)) or "(no prose block changed)"
    return p, c


def _inside(passage: str, changed: list[str]) -> bool:
    n = M.norm(passage)
    return bool(n) and any(n in M.norm(t) for t in changed)


def resolve(data: dict, prior: list[dict]) -> list[dict]:
    """The prior findings with the critic's verdict on each. Missing answers, unknown statuses and a resolved/not_applicable without evidence stay unresolved."""
    ans = {}
    for r in data.get("resolutions") or []:
        if isinstance(r, dict) and r.get("id") is not None:
            ans[str(r["id"])] = r
    out = []
    for f in prior:
        r = ans.get(f["id"]) or {}
        status, ev = str(r.get("status") or "").strip().lower(), str(r.get("evidence") or "").strip()
        if status not in RESOLUTIONS or (status != "unresolved" and not ev):
            status, ev = "unresolved", ev or "the critic gave no usable answer for this finding"
        base = {**f, "kind": "prior", "claim_span": "", "verified": True, "prior": True, "resolution": status, "evidence": ev}
        if status == "unresolved":
            out.append({**base, "severity": "major"})
        else:
            out.append({**base, "severity": "resolved" if status == "resolved" else "not_applicable", "original_severity": "major"})
    return out


def scope_new(findings: list[dict], changed: list[str], taken: set[str]) -> list[dict]:
    """New findings of a scoped round: ids made unique against the prior ones; a verified major outside the changed blocks becomes a minor suggestion."""
    out = []
    for f in findings:
        fid, k = f["id"], 2
        while fid in taken:
            fid, k = f"{f['id']}.{k}", k + 1
        taken.add(fid)
        f = {**f, "id": fid, "prior": False}
        if f["severity"] == "major" and f["verified"] and not _inside(f["passage"], changed):
            f = {**f, "original_severity": "major", "severity": "minor", "suggestion": True, "downgrade_reason": DOWNGRADE_REASON}
        out.append(f)
    return out
