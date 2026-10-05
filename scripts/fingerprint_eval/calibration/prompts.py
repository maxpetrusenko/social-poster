"""Judge prompt variants. `current` is the pre-calibration production prompt (frozen copy, kept so cached results stay
keyed); A is a candidate; B is now judge.JUDGE_PROMPT (the adopted prompt, byte-identical to the calibrated B)."""
from __future__ import annotations

from ..judge import JUDGE_PROMPT as PROMPT_B, parse_verdicts as parse_current

CURRENT = """/no_think
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

PROMPTS = {"current": (CURRENT, parse_current), "A": (PROMPT_A, parse_current), "B": (PROMPT_B, parse_current)}
