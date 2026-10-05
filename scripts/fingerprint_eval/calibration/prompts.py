"""Judge prompt variants. `current` is judge.JUDGE_PROMPT imported unchanged; A and B are candidates (judge.py is not modified)."""
from __future__ import annotations

import json
import re

from ..judge import JUDGE_PROMPT as CURRENT, VERDICTS, parse_verdicts as parse_current

PROMPT_A = """/no_think
You are a fact-consistency checker. Decide whether a rewritten passage still conveys each claim taken from the original.
The rewrite may legitimately differ in wording, sentence structure, sentence order, formatting, punctuation, spelling variants, and metaphor. Those never matter.
Judge only FACTS. For each numbered claim give a verdict:
- "entailed": the passage conveys the same fact, even if paraphrased, split across sentences, reordered, or said figuratively. Paraphrase with the same factual content is entailed. A claim about how the text frames or describes something is entailed when the passage does that.
- "changed": the passage states something that conflicts with the claim on a FACT dimension: a number or unit, a name or entity, a date, polarity (negation), modality or certainty (may/does, can/always), causal direction, scope (some/all), or an attribution (which study, paper, outlet or person).
- "missing": the passage contains no information that bears on the claim.
When unsure between "entailed" and "changed", ask whether a careful reader would come away believing a different fact. If not, answer "entailed".
Return ONLY JSON, nothing before or after it: [{{"i": 1, "verdict": "entailed", "reason": "<=15 words"}}, ...]
Include exactly one entry per claim id, no others.

Claims:
{claims}

Rewritten passage:
{passage}
"""

PROMPT_B = """/no_think
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


def parse_extended(raw: str, n: int) -> dict[int, dict]:
    """Same strictness as judge.parse_verdicts, but allows the extra evidence/dimension keys."""
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("not a list")
    out: dict[int, dict] = {}
    for v in data:
        if not isinstance(v, dict) or set(v) - {"i", "verdict", "reason", "evidence", "dimension"} or "i" not in v or "verdict" not in v:
            raise ValueError(f"bad entry {str(v)[:80]}")
        i = v["i"]
        if isinstance(i, bool) or not isinstance(i, int) or i in out or v["verdict"] not in VERDICTS:
            raise ValueError(f"bad id/verdict {i!r}")
        out[i] = v
    if set(out) != set(range(1, n + 1)):
        raise ValueError("claim ids mismatch")
    return out


PROMPTS = {"current": (CURRENT, parse_current), "A": (PROMPT_A, parse_current), "B": (PROMPT_B, parse_extended)}
