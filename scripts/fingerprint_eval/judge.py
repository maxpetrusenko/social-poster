"""Claim judging. Strict parsing: the whole reply is one schema-valid JSON value covering exactly the requested claim ids.

Policy (docs/fingerprint-gate-calibration.md):
1. prompt B (quote evidence, name the fact dimension);
2. identity pre-filter: a segment whose normalized text equals the reference segment is entailed with zero calls;
3. confirmation: claims flagged changed/missing are re-judged twice more (flagged claims only, one batch per
   segment); the final verdict is the 2-of-3 majority and the per-claim votes are recorded.
The baseline-delta rule (ignore claims already flagged on the unchanged reference) is optional and NOT applied here.
"""
from __future__ import annotations

import json
import re
import unicodedata

from .contracts import Category
from .errors import EvaluationError
from .gateway import GatewayError, Model
from .rewrite import Segment

VERDICTS = ("entailed", "changed", "missing")
CONFIRM_RUNS = 2  # extra judge passes over flagged claims; with the first pass that is 3 votes

JUDGE_PROMPT = """/no_think
You are a fact-consistency checker. For each numbered claim, find the sentence(s) in the rewritten passage that bear on it, then decide.
Wording, sentence structure, order, formatting, spelling variants, punctuation and metaphor are irrelevant. Only facts count.
Verdicts:
- "entailed": the passage conveys the same fact. Paraphrase with the same factual content is entailed.
- "changed": the passage conflicts with the claim on a fact dimension. You MUST name the dimension: number, unit, name, entity, date, polarity, modality, causality, scope, or attribution.
- "missing": nothing in the passage bears on the claim.
Do not use "changed" for a difference of tone, emphasis, or style. Do use it when a number, unit, name, negation, hedge (may/can/some), cause-effect direction, scope or source differs from the claim, even slightly.
For every claim copy the supporting or conflicting quote from the passage ("evidence", empty string if missing).
Return ONLY JSON, nothing before or after it: [{{"i": 1, "evidence": "<quote>", "dimension": "<dimension or none>", "verdict": "entailed", "reason": "<=15 words"}}, ...]
Include exactly one entry per claim id, no others.

Claims:
{claims}

Rewritten passage:
{passage}
"""

_FENCE = re.compile(r"\A```(?:json)?[ \t]*\n(.*)\n```\Z", re.S)
_IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_ALLOWED_KEYS = {"i", "verdict", "reason", "evidence", "dimension"}


def normalize(text: str) -> str:
    """NFKC, lowercase, drop image markdown, collapse whitespace. Punctuation and markdown emphasis are kept on purpose:
    a punctuation edit can change a number (13.2 vs 132), so only whitespace/case/image differences are skipped."""
    t = unicodedata.normalize("NFKC", text)
    t = _IMG.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def identical(candidate: str, reference: str) -> bool:
    return normalize(candidate) == normalize(reference)


def parse_verdicts(raw: str, n: int) -> dict[int, dict]:
    """Raise ValueError unless raw (after one optional ```json fence) is a JSON list of
    {i, verdict[, reason, evidence, dimension]} with ids exactly 1..n, each once, verdicts in VERDICTS."""
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)  # any trailing/leading garbage raises
    if not isinstance(data, list):
        raise ValueError("judge reply is not a JSON list")
    out: dict[int, dict] = {}
    for v in data:
        if not isinstance(v, dict) or set(v) - _ALLOWED_KEYS or "i" not in v or "verdict" not in v:
            raise ValueError(f"bad judge entry: {str(v)[:80]}")
        i, verdict = v["i"], v["verdict"]
        if isinstance(i, bool) or not isinstance(i, int) or i in out:
            raise ValueError(f"bad or duplicate claim id {i!r}")
        if verdict not in VERDICTS:
            raise ValueError(f"bad verdict {verdict!r}")
        for key in ("reason", "evidence", "dimension"):
            if key in v and not isinstance(v[key], str):
                raise ValueError(f"{key} must be a string")
        out[i] = v
    if set(out) != set(range(1, n + 1)):
        raise ValueError(f"claim ids {sorted(out)} != expected 1..{n}")
    return out


def _numbered(claims: list[str]) -> str:
    return "\n".join(f"{i + 1}. {c}" for i, c in enumerate(claims))


def _call(judge: Model, claims: list[str], passage: str) -> dict[int, dict]:
    """One judged batch with one retry on bad output. Raises GatewayError/ValueError (last failure) when both attempts fail."""
    last: Exception | None = None
    for _ in range(2):
        try:
            raw = judge.complete(JUDGE_PROMPT.format(claims=_numbered(claims), passage=passage), **({"temperature": 0.0, "max_tokens": 6000} if judge.backend == "gateway" else {}))
            return parse_verdicts(raw, len(claims))
        except (GatewayError, ValueError) as e:  # json.JSONDecodeError is a ValueError
            last = e
    assert last is not None
    raise last


def _judge_error(section: str, last: Exception) -> EvaluationError:
    cat = last.category if isinstance(last, GatewayError) and last.category is not Category.UNKNOWN_ERROR else Category.MALFORMED_MODEL_OUTPUT
    return EvaluationError(f"judge failed for section {section!r} after retry: {str(last)[:200]}", category=cat, dependency=getattr(last, "dependency", None) or "gateway-chat")


def majority(votes: list[str]) -> str:
    """2-of-3 policy: flagged iff at least 2 of the cast votes are non-entailed (ties go to the first-pass verdict,
    which is a flag by construction). The flag label is the most common non-entailed one, first-seen on a tie."""
    flags = [v for v in votes if v != "entailed"]
    if len(flags) * 2 < len(votes) or (len(flags) * 2 == len(votes) and votes[0] == "entailed"):
        return "entailed"
    return max(dict.fromkeys(flags), key=flags.count)


def judge_claims(segments: list[Segment], judge: Model, strict: bool = False) -> dict:
    """Per-segment batch judging of extracted claims against the rewritten segment.
    strict (gate): a segment that cannot be judged after one retry (first pass or confirmation) raises EvaluationError.
    non-strict (research runs): a segment whose first pass fails has its claims counted unjudged and reported; a failed
    confirmation pass simply casts no vote.
    Result extras: judge_calls, prefiltered_segments, overturned (flags the 2-of-3 vote dropped); each flagged entry
    carries `votes` (per-pass verdicts)."""
    counts = {"entailed": 0, "changed": 0, "missing": 0, "unjudged": 0}
    flagged: list[dict] = []
    overturned: list[dict] = []
    calls = prefiltered = 0
    for seg in segments:
        if seg.frozen or not seg.propositions:
            continue
        claims = [p["claim"] for p in seg.propositions]
        if isinstance(seg.output, str) and isinstance(seg.text, str) and identical(seg.output, seg.text):
            prefiltered += 1
            counts["entailed"] += len(claims)
            continue
        try:
            calls += 1
            first = _call(judge, claims, seg.output)
        except (GatewayError, ValueError) as e:
            if strict:
                raise _judge_error(seg.section, e) from e
            first = None
        votes: dict[int, list[str]] = {i: [first[i]["verdict"]] for i in first} if first else {}
        flag_ids = [i for i in sorted(votes) if votes[i][0] != "entailed"]
        details = {i: first[i] for i in first} if first else {}
        if flag_ids:
            sub = [claims[i - 1] for i in flag_ids]
            for _ in range(CONFIRM_RUNS):
                try:
                    calls += 1
                    again = _call(judge, sub, seg.output)
                except (GatewayError, ValueError) as e:
                    if strict:
                        raise _judge_error(seg.section, e) from e
                    continue
                for k, i in enumerate(flag_ids, 1):
                    votes[i].append(again[k]["verdict"])
        for i, p in enumerate(seg.propositions, 1):
            if i not in votes:
                counts["unjudged"] += 1
                flagged.append({"section": seg.section, "claim": p["claim"], "verdict": "unjudged", "reason": "judge returned no valid verdict", "votes": []})
                continue
            verdict = majority(votes[i])
            counts[verdict] += 1
            d = details[i]
            if verdict != "entailed":
                flagged.append({"section": seg.section, "claim": p["claim"], "verdict": verdict, "reason": d.get("reason", ""), "evidence": d.get("evidence", ""), "dimension": d.get("dimension", ""), "votes": votes[i]})
            elif len(votes[i]) > 1:
                overturned.append({"section": seg.section, "claim": p["claim"], "votes": votes[i]})
    total = sum(counts.values())
    return {"judge": judge.name, "total": total, **{f"claims_{k}": v for k, v in counts.items()}, "flagged": flagged,
            "judge_calls": calls, "prefiltered_segments": prefiltered, "overturned": overturned}
