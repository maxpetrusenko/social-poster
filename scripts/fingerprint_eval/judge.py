"""Claim judging. Strict parsing: the whole reply is one schema-valid JSON value covering exactly the requested claim ids."""
from __future__ import annotations

import json
import re

from .errors import EvaluationError
from .gateway import GatewayError, Model
from .rewrite import Segment

VERDICTS = ("entailed", "changed", "missing")

JUDGE_PROMPT = """/no_think
You check whether a rewritten passage still states each claim from the original.
For each numbered claim give a verdict:
- "entailed": the passage states it or clearly implies it, with the same names, numbers, and causal direction
- "changed": the passage states something different (altered number, name, causality, certainty)
- "missing": the passage does not state it
Return ONLY JSON, nothing before or after it: [{{"i": 1, "verdict": "entailed", "reason": "<=15 words"}}, ...]
Include exactly one entry per claim id, no others.

Claims:
{claims}

Rewritten passage:
{passage}
"""

_FENCE = re.compile(r"\A```(?:json)?[ \t]*\n(.*)\n```\Z", re.S)


def parse_verdicts(raw: str, n: int) -> dict[int, dict]:
    """Raise ValueError unless raw (after one optional ```json fence) is a JSON list of {i, verdict[, reason]}
    with ids exactly 1..n, each once, verdicts in VERDICTS."""
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)  # any trailing/leading garbage raises
    if not isinstance(data, list):
        raise ValueError("judge reply is not a JSON list")
    out: dict[int, dict] = {}
    for v in data:
        if not isinstance(v, dict) or set(v) - {"i", "verdict", "reason"} or "i" not in v or "verdict" not in v:
            raise ValueError(f"bad judge entry: {str(v)[:80]}")
        i, verdict = v["i"], v["verdict"]
        if isinstance(i, bool) or not isinstance(i, int) or i in out:
            raise ValueError(f"bad or duplicate claim id {i!r}")
        if verdict not in VERDICTS:
            raise ValueError(f"bad verdict {verdict!r}")
        if "reason" in v and not isinstance(v["reason"], str):
            raise ValueError("reason must be a string")
        out[i] = v
    if set(out) != set(range(1, n + 1)):
        raise ValueError(f"claim ids {sorted(out)} != expected 1..{n}")
    return out


def judge_claims(segments: list[Segment], judge: Model, strict: bool = False) -> dict:
    """Per-segment batch judging of extracted claims against the rewritten segment.
    strict (gate): a segment that cannot be judged after one retry raises EvaluationError.
    non-strict (research runs): its claims are counted unjudged and reported."""
    counts = {"entailed": 0, "changed": 0, "missing": 0, "unjudged": 0}
    flagged: list[dict] = []
    for seg in segments:
        if seg.frozen or not seg.propositions:
            continue
        claims = "\n".join(f"{i + 1}. {p['claim']}" for i, p in enumerate(seg.propositions))
        verdicts, last = None, None
        for _ in range(2):
            try:
                raw = judge.complete(JUDGE_PROMPT.format(claims=claims, passage=seg.output), **({"temperature": 0.0, "max_tokens": 6000} if judge.backend == "gateway" else {}))
                verdicts = parse_verdicts(raw, len(seg.propositions))
                break
            except (GatewayError, ValueError) as e:  # json.JSONDecodeError is a ValueError
                last = e
        if verdicts is None and strict:
            raise EvaluationError(f"judge failed for section {seg.section!r} after retry: {str(last)[:200]}")
        for i, p in enumerate(seg.propositions, 1):
            v = (verdicts or {}).get(i)
            verdict = v["verdict"] if v else "unjudged"
            counts[verdict] += 1
            if verdict != "entailed":
                flagged.append({"section": seg.section, "claim": p["claim"], "verdict": verdict, "reason": (v or {}).get("reason", "judge returned no valid verdict")})
    total = sum(counts.values())
    return {"judge": judge.name, "total": total, **{f"claims_{k}": v for k, v in counts.items()}, "flagged": flagged}
