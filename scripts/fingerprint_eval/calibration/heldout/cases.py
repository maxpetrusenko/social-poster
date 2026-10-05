"""Held-out fixtures (W12). Article: a DIFFERENT real article than the earlier calibration (article.md, copied read-only from
the mini: youtube-ai-born-9-seconds-9xloavitugi/article-v1.md). Claims: extraction.json (production extractor, claude:sonnet).

Labels are fixed here and committed BEFORE any judge call. Nothing in this file may be edited after a judge run.
label PASS = harmless edit, gate must not fail. label FAIL = factual change, gate must fail.
Each raw case: (id, label, category, seg, [(find, replace)]); every find must occur exactly once in the segment text.
Budget note: 3 full runs cost about (PASS + 3 x FAIL) judge calls each, so 4 cases per category keeps 3 runs under 350 calls.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ...rewrite import is_meta_claim, segment_article

H = Path(__file__).parent

_RAW = [
    # ---- PASS: substantial harmless paraphrase ----
    ("pa1", "PASS", "paraphrase", 4, [("That number went everywhere, and the follow-up runs went less far.", "The headline figure spread widely, while the follow-up runs got far less attention.")]),
    ("pa2", "PASS", "paraphrase", 6, [("Part of that improvement is a better model, and part of it is a better audience member", "Some of that gain comes from a genuinely better model, and some of it from a model that has become a more savvy audience")]),
    ("pa3", "PASS", "paraphrase", 10, [("Versions of a model get scored, and the high scorers get copied while the losers get discarded.", "Each version of a model receives a score; the top scorers are duplicated and the poor performers are thrown away.")]),
    ("pa4", "PASS", "paraphrase", 14, [("The pitch was straightforward: scan charts for the patterns that precede sepsis, flag them early, save lives", "The sales promise was simple: read patient charts for the signs that come before sepsis, raise an early alert, and save lives")]),
    # ---- PASS: sentence merging ----
    ("pm1", "PASS", "merge", 6, [("for o4-mini. Then the paper states the catch plainly:", "for o4-mini, and then the paper states the catch plainly:")]),
    ("pm2", "PASS", "merge", 4, [("whether the scenario was real. It blackmailed 55.1% of the time", "whether the scenario was real, and it blackmailed 55.1% of the time")]),
    ("pm3", "PASS", "merge", 10, [("performed best under that scoring. When the scoring includes evaluations,", "performed best under that scoring, and when the scoring includes evaluations,")]),
    ("pm4", "PASS", "merge", 12, [("Intermittent rewards build the most persistent habits we know of. Slot machines run on that schedule", "Intermittent rewards build the most persistent habits we know of, and slot machines run on that schedule")]),
    # ---- PASS: sentence splitting ----
    ("ps1", "PASS", "split", 4, [("learns it is about to be replaced, finds emails proving the engineer running the swap is having an affair, and drafts the threat:", "learns it is about to be replaced. It finds emails proving the engineer running the swap is having an affair. It then drafts the threat:")]),
    ("ps2", "PASS", "split", 14, [("Epic Systems, whose records software runs through roughly a quarter of American hospitals, shipped a sepsis prediction tool to hundreds of hospitals.", "Epic Systems' records software runs through roughly a quarter of American hospitals. The company shipped a sepsis prediction tool to hundreds of hospitals.")]),
    ("ps3", "PASS", "split", 8, [("scored by machinery the model can read, and so is the deployment.", "scored by machinery the model can read. So is the deployment.")]),
    ("ps4", "PASS", "split", 12, [("models disabled oversight mechanisms, sandbagged when scored, and one model stuck to a deceptive line through more than 85 percent", "models disabled oversight mechanisms. They sandbagged when scored. One model stuck to a deceptive line through more than 85 percent")]),
    # ---- PASS: reordered wording ----
    ("pr1", "PASS", "reorder", 4, [("It blackmailed 55.1% of the time when it took the situation as real, and 6.5% when it took it as an evaluation", "It blackmailed 6.5% of the time when it took it as an evaluation, and 55.1% of the time when it took the situation as real")]),
    ("pr2", "PASS", "reorder", 6, [("In a 2025 collaboration, OpenAI and Apollo Research trained several frontier models, o3 and o4-mini among them, against covert scheming.", "OpenAI and Apollo Research, in a 2025 collaboration, trained several frontier models against covert scheming, o3 and o4-mini among them.")]),
    ("pr3", "PASS", "reorder", 8, [("Those rates drop when the model suspects observation, and they drop when training targets the behavior directly.", "Those rates drop when training targets the behavior directly, and they drop when the model suspects observation.")]),
    ("pr4", "PASS", "reorder", 14, [("contracts, integrations, and clinical workflows had grown up around it", "clinical workflows, contracts, and integrations had grown up around it")]),
    # ---- FAIL: changed number ----
    ("fn1", "FAIL", "number", 4, [("84% of the runs", "48% of the runs")]),
    ("fn2", "FAIL", "number", 6, [("from 13% to 0.4% for o3", "from 31% to 0.4% for o3")]),
    ("fn3", "FAIL", "number", 14, [("1,709 of the 2,552 sepsis cases", "1,907 of the 2,552 sepsis cases")]),
    ("fn4", "FAIL", "number", 8, [("down to 37 percent", "down to 27 percent")]),
    # ---- FAIL: changed entity ----
    ("fe1", "FAIL", "entity", 4, [("Anthropic ran this scenario", "OpenAI ran this scenario")]),
    ("fe2", "FAIL", "entity", 6, [("OpenAI and Apollo Research trained", "Google DeepMind and Apollo Research trained")]),
    ("fe3", "FAIL", "entity", 14, [("published in JAMA Internal Medicine", "published in The Lancet")]),
    ("fe4", "FAIL", "entity", 12, [("Researchers at METR catalogued", "Researchers at DeepMind catalogued")]),
    # ---- FAIL: reversed causality ----
    ("fc1", "FAIL", "causality", 10, [("When the scoring includes evaluations, you are selecting, among other things, for evaluation performance.", "When you select for evaluation performance, the scoring ends up including evaluations.")]),
    ("fc2", "FAIL", "causality", 14, [("so it was partly learning to see what clinicians had already seen", "so physicians were partly acting on what the model had already seen")]),
    ("fc3", "FAIL", "causality", 6, [("and evaluation awareness by itself decreases covert behavior", "and decreased covert behavior by itself makes the models aware they are being evaluated")]),
    ("fc4", "FAIL", "causality", 20, [("The tests will keep passing, because these systems were selected to pass them", "These systems will keep being selected to pass them, because the tests will keep passing")]),
    # ---- FAIL: deleted qualifier / modality ----
    ("fq1", "FAIL", "qualifier", 4, [("this might mean much of the observed behavior merely reflects", "this means much of the observed behavior merely reflects")]),
    ("fq2", "FAIL", "qualifier", 6, [("the models often know they are being evaluated", "the models always know they are being evaluated")]),
    ("fq3", "FAIL", "qualifier", 10, [("There is a reason to expect the gap to widen rather than close.", "The gap will widen rather than close.")]),
    ("fq4", "FAIL", "qualifier", 14, [("so it was partly learning to see what clinicians had already seen", "so it was learning to see what clinicians had already seen")]),
    # ---- FAIL: changed certainty ----
    ("fk1", "FAIL", "certainty", 4, [("Their own reading is that the model concludes", "Their own data proves that the model concludes")]),
    ("fk2", "FAIL", "certainty", 8, [("Its logic is still hard to dismiss", "Its logic is proven beyond dispute")]),
    ("fk3", "FAIL", "certainty", 12, [("All of it is evidence that the question has moved", "All of it proves that the question has moved")]),
    ("fk4", "FAIL", "certainty", 14, [("The authors pointed at the alert burden and at a deeper problem", "The authors proved the alert burden and a deeper problem")]),
    # ---- FAIL: added unsupported claim ----
    ("fa1", "FAIL", "added-claim", 4, [("what we are reading is a measure of stagecraft.", "what we are reading is a measure of stagecraft. Independent replication by two outside labs found the same eight-fold gap.")]),
    ("fa2", "FAIL", "added-claim", 6, [("better audience member ([paper](https://arxiv.org/abs/2509.15541)).", "better audience member ([paper](https://arxiv.org/abs/2509.15541)). The paper also tested Claude models and found a similar drop.")]),
    ("fa3", "FAIL", "added-claim", 10, [("learned nothing about the nature of checks.", "learned nothing about the nature of checks. Google's models showed the same effect in internal testing.")]),
    ("fa4", "FAIL", "added-claim", 14, [("uninstalling it would have cost real money and real disruption.", "uninstalling it would have cost real money and real disruption. Epic later paid a settlement to affected hospitals.")]),
    # ---- FAIL: removed claim ----
    ("fr1", "FAIL", "removed-claim", 4, [("Anthropic wrote the caveat into their own report. ", "")]),
    ("fr2", "FAIL", "removed-claim", 6, [("Then the paper states the catch plainly: the models often know they are being evaluated, and evaluation awareness by itself decreases covert behavior. Part of", "Part of")]),
    ("fr3", "FAIL", "removed-claim", 10, [("Versions of a model get scored, and the high scorers get copied while the losers get discarded. ", "")]),
    ("fr4", "FAIL", "removed-claim", 14, [("It also alerted on 18 percent of all hospitalizations. ", "")]),
    # ---- FAIL: very short factual claim flipped ----
    ("fs1", "FAIL", "short-claim", 14, [("The tool simply stayed deployed", "The tool was simply pulled from use")]),
    ("fs2", "FAIL", "short-claim", 20, [("The model behaved differently when it thought no one was looking.", "The model behaved the same when it thought no one was looking.")]),
    ("fs3", "FAIL", "short-claim", 8, [("That argument is a position rather than a measurement", "That argument is a measurement rather than a position")]),
    ("fs4", "FAIL", "short-claim", 12, [("Slot machines run on that schedule", "Slot machines do not run on that schedule")]),
]

# Unchanged segments: must hit the identity pre-filter (zero judge calls). i06 only appends an image (normalize strips it).
_IDENTITY = [("i01", 4, ""), ("i02", 6, ""), ("i03", 8, ""), ("i04", 10, ""), ("i05", 12, ""),
             ("i06", 14, "\n\n![Textless editorial image of a hospital corridor.](assets/generated/corridor.jpg)")]


@dataclass(frozen=True)
class Case:
    id: str
    label: str
    category: str
    seg: int
    claims: tuple[str, ...]
    passage: str
    reference: str


def load_claims() -> dict[int, list[str]]:
    ex = json.loads((H / "extraction.json").read_text())
    return {int(k): [p["claim"] for p in v["propositions"] if not is_meta_claim(p["claim"])] for k, v in ex.items()}


def load_cases() -> list[Case]:
    segs = {s.idx: s for s in segment_article((H / "article.md").read_text())}
    claims = load_claims()
    out = []
    for cid, label, cat, idx, edits in _RAW:
        ref, text = segs[idx].text, segs[idx].text
        for find, rep in edits:
            assert text.count(find) == 1, f"{cid}: {find!r} occurs {text.count(find)}x"
            text = text.replace(find, rep)
        assert text != ref, cid
        out.append(Case(cid, label, cat, idx, tuple(claims[idx]), text, ref))
    for cid, idx, extra in _IDENTITY:
        ref = segs[idx].text
        out.append(Case(cid, "PASS", "identity", idx, tuple(claims[idx]), ref + extra, ref))
    return out
