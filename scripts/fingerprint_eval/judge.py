"""Claim judging. Strict parsing: the whole reply is one schema-valid JSON value covering exactly the requested claim ids.

Policy (docs/fingerprint-gate-calibration.md):
1. prompt B (quote evidence, name the fact dimension);
2. identity pre-filter: a segment whose normalized text equals the reference segment is entailed with zero calls;
3. any first-pass changed/missing flag is final (recall policy, W12b: confirmation votes never clear a flag; on held-out
   set 1 the 2-of-3 vote overturned only TRUE flags and removed zero false alarms). `confirm_telemetry=True` re-judges the
   flagged claims twice more and records the votes next to the flag, for telemetry only.
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
from .textutil import parallel_map

VERDICTS = ("entailed", "changed", "missing")
JUDGE_BATCH = 10  # max claims per judge call (part of the gate cache key, authz._cache_extra); larger sections are chunked
CONFIRM_RUNS = 2  # telemetry-only extra judge passes over flagged claims (judge_claims(confirm_telemetry=True))

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


class MissingIds(ValueError):
    """Valid reply, every entry well formed, but some expected ids are absent. Carries the valid partial result."""

    def __init__(self, partial: dict[int, dict], missing: list[int]):
        super().__init__(f"claim ids {sorted(partial)} != expected; missing {missing}")
        self.partial, self.missing = partial, missing


def parse_entries(raw: str, n: int, verdicts: tuple, keys: set, strings: tuple) -> dict[int, dict]:
    """Strict parse shared with added.py. ValueError for anything malformed, extra/duplicate ids or bad verdicts;
    MissingIds (a ValueError) only when the reply is otherwise valid but lacks some of ids 1..n."""
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)  # any trailing/leading garbage raises
    if not isinstance(data, list):
        raise ValueError("judge reply is not a JSON list")
    out: dict[int, dict] = {}
    for v in data:
        if not isinstance(v, dict) or set(v) - keys or "i" not in v or "verdict" not in v:
            raise ValueError(f"bad judge entry: {str(v)[:80]}")
        i, verdict = v["i"], v["verdict"]
        if isinstance(i, bool) or not isinstance(i, int) or i in out:
            raise ValueError(f"bad or duplicate claim id {i!r}")
        if verdict not in verdicts:
            raise ValueError(f"bad verdict {verdict!r}")
        for key in strings:
            if key in v and not isinstance(v[key], str):
                raise ValueError(f"{key} must be a string")
        out[i] = v
    expected = set(range(1, n + 1))
    if set(out) - expected:
        raise ValueError(f"claim ids {sorted(out)} != expected 1..{n}")
    if set(out) != expected:
        raise MissingIds(out, sorted(expected - set(out)))
    return out


def parse_verdicts(raw: str, n: int) -> dict[int, dict]:
    """Raise ValueError unless raw (after one optional ```json fence) is a JSON list of
    {i, verdict[, reason, evidence, dimension]} with ids exactly 1..n, each once, verdicts in VERDICTS."""
    return parse_entries(raw, n, VERDICTS, _ALLOWED_KEYS, ("reason", "evidence", "dimension"))


def ask_chunked(claims: list[str], ask, parse) -> tuple[dict[int, dict], int]:
    """Judge `claims` in chunks of at most JUDGE_BATCH, each numbered 1..k; results come back keyed by GLOBAL id (1..len(claims)).
    ask(sub_claims) -> raw reply; parse(raw, n) -> {1..n: entry}. Per chunk: one retry on a gateway error or malformed reply;
    a reply that is valid but misses ids gets ONE targeted re-ask for just those ids; still missing -> ValueError.
    A verdict is never inferred for a missing claim. Returns (verdicts, number of chunks)."""
    out: dict[int, dict] = {}
    chunks = 0
    for start in range(0, len(claims), JUDGE_BATCH):
        chunk = claims[start:start + JUDGE_BATCH]
        chunks += 1
        got: dict[int, dict] | None = None
        last: Exception | None = None
        for _ in range(2):
            try:
                got = parse(ask(chunk), len(chunk))
                break
            except MissingIds as e:
                got, miss = dict(e.partial), e.missing
                try:
                    again = parse(ask([chunk[i - 1] for i in miss]), len(miss))
                except MissingIds as e2:
                    raise ValueError(f"claim ids still missing after targeted re-ask: {[miss[j - 1] for j in e2.missing]}") from e2
                got.update({miss[k - 1]: v for k, v in again.items()})
                break
            except (GatewayError, ValueError) as e:  # json.JSONDecodeError is a ValueError
                last = e
        if got is None:
            assert last is not None
            raise last
        out.update({start + i: v for i, v in got.items()})
    return out, chunks


def _numbered(claims: list[str]) -> str:
    return "\n".join(f"{i + 1}. {c}" for i, c in enumerate(claims))


def _call(judge: Model, claims: list[str], passage: str) -> tuple[dict[int, dict], int]:
    """Judged claims (chunked, global ids) and the chunk count. Raises GatewayError/ValueError when a chunk cannot be completed."""
    kw = {"temperature": 0.0, "max_tokens": 6000} if judge.backend == "gateway" else {}
    return ask_chunked(claims, lambda sub: judge.complete(JUDGE_PROMPT.format(claims=_numbered(sub), passage=passage), **kw), parse_verdicts)


def _judge_error(section: str, last: Exception) -> EvaluationError:
    cat = last.category if isinstance(last, GatewayError) and last.category is not Category.UNKNOWN_ERROR else Category.MALFORMED_MODEL_OUTPUT
    return EvaluationError(f"judge failed for section {section!r} after retry: {str(last)[:200]}", category=cat, dependency=getattr(last, "dependency", None) or "gateway-chat")


def judge_claims(segments: list[Segment], judge: Model, strict: bool = False, confirm_telemetry: bool = False) -> dict:
    """Per-segment batch judging of extracted claims against the rewritten segment.
    The first-pass verdict is the verdict: any changed/missing flag counts. strict (gate): a segment that cannot be judged
    after one retry raises EvaluationError. non-strict (research runs): a segment whose first pass fails has its claims
    counted unjudged and reported.
    confirm_telemetry: flagged claims are re-judged CONFIRM_RUNS more times; the votes are recorded on the flag (`votes`)
    and never change a verdict. A failed telemetry call is ignored (it can neither raise nor clear anything).
    Result extras: judge_calls, prefiltered_segments, overturned (always empty, kept for report compatibility)."""
    counts = {"entailed": 0, "changed": 0, "missing": 0, "unjudged": 0}
    flagged: list[dict] = []
    overturned: list[dict] = []
    calls = prefiltered = 0
    todo = [seg for seg in segments if not (seg.frozen or not seg.propositions)]

    def first_pass(seg: Segment):
        """(first, n_calls, error) for a segment that needs the judge; (None, 0, None) for an identity-prefiltered one."""
        if isinstance(seg.output, str) and isinstance(seg.text, str) and identical(seg.output, seg.text):
            return None, 0, None
        try:
            first, n_calls = _call(judge, [p["claim"] for p in seg.propositions], seg.output)
            return first, n_calls, None
        except (GatewayError, ValueError) as e:
            return None, 0, e

    # first-pass calls run on a bounded pool; results are consumed in segment order, so the output is deterministic
    firsts = parallel_map(first_pass, todo)
    for seg, (first, n_calls, err) in zip(todo, firsts):
        claims = [p["claim"] for p in seg.propositions]
        if isinstance(seg.output, str) and isinstance(seg.text, str) and identical(seg.output, seg.text):
            prefiltered += 1
            counts["entailed"] += len(claims)
            continue
        calls += n_calls
        if err is not None and strict:
            raise _judge_error(seg.section, err) from err
        votes: dict[int, list[str]] = {i: [first[i]["verdict"]] for i in first} if first else {}
        flag_ids = [i for i in sorted(votes) if votes[i][0] != "entailed"]
        details = {i: first[i] for i in first} if first else {}
        if flag_ids and confirm_telemetry:
            sub = [claims[i - 1] for i in flag_ids]
            for _ in range(CONFIRM_RUNS):
                try:
                    again, n_calls = _call(judge, sub, seg.output)
                    calls += n_calls
                except (GatewayError, ValueError):
                    continue  # telemetry only: a failed vote is simply absent
                for k, i in enumerate(flag_ids, 1):
                    votes[i].append(again[k]["verdict"])
        for i, p in enumerate(seg.propositions, 1):
            if i not in votes:
                counts["unjudged"] += 1
                flagged.append({"section": seg.section, "claim": p["claim"], "verdict": "unjudged", "reason": "judge returned no valid verdict", "votes": []})
                continue
            verdict = votes[i][0]
            counts[verdict] += 1
            d = details[i]
            if verdict != "entailed":
                flagged.append({"section": seg.section, "claim": p["claim"], "verdict": verdict, "reason": d.get("reason", ""), "evidence": d.get("evidence", ""), "dimension": d.get("dimension", ""), "votes": votes[i]})
    total = sum(counts.values())
    return {"judge": judge.name, "total": total, **{f"claims_{k}": v for k, v in counts.items()}, "flagged": flagged,
            "judge_calls": calls, "prefiltered_segments": prefiltered, "overturned": overturned}
