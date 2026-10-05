"""Labeled calibration cases: minimal edits of one prose segment of the real reference article (draft-v1.md).

label PASS = benign edit, gate must not fail. label FAIL = factual change, gate must fail.
Each raw case: (id, label, category, seg, edits[(find, replace)]). Each find must occur exactly once in the segment text.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ..rewrite import is_meta_claim, segment_article

EXP = Path(__file__).resolve().parents[3] / "experiments" / "youtube-body-thinks-before-mind-bgyi1l1p4nw"
IMG = "![Textless editorial image of a lab bench.](assets/generated/lab-bench.jpg)"

_RAW = [
    # ---- PASS: benign edits ----
    ("n01", "PASS", "spelling", 4, [("grey figure", "gray figure")]),
    ("n02", "PASS", "punctuation", 6, [("Cortisol rose. Calm music felt gloomier.", "Cortisol rose; calm music felt gloomier.")]),
    ("n03", "PASS", "punctuation", 30, [("Milk production continues. Headaches arrive. Night sweats. Fatigue.", "Milk production continues, headaches arrive, night sweats, fatigue.")]),
    ("n04", "PASS", "punctuation", 10, [("The question was clean: what happens", "The question was clean. What happens")]),
    ("n05", "PASS", "synonym", 4, [("had little patience for ghost stories", "had scant patience for ghost stories"), ("flood his body", "wash over his body")]),
    ("n06", "PASS", "synonym", 20, [("It is often caught late, spreads fast,", "It is frequently diagnosed late, spreads quickly,")]),
    ("n07", "PASS", "synonym", 34, [("One surprise was lynestrenol", "One unexpected finding was lynestrenol")]),
    ("n08", "PASS", "split", 6, [("Tandy moved the table, watched the blade's vibration rise and fall, and traced", "Tandy moved the table. He watched the blade's vibration rise and fall. He traced")]),
    ("n09", "PASS", "split", 24, [("a senescent-like state, then broadcast signals", "a senescent-like state. They then broadcast signals")]),
    ("n10", "PASS", "merge", 26, [("stop dividing. These cells stop and still act.", "stop dividing, but these cells stop and still act.")]),
    ("n11", "PASS", "reorder", 12, [("word meaning, grammatical roles, and the probability", "grammatical roles, word meaning, and the probability")]),
    ("n12", "PASS", "reorder", 16, [("plots, missions, conversations, travel, conflict, obligation", "conflict, obligation, plots, missions, conversations, travel")]),
    ("n13", "PASS", "image", 4, [("Then a blade in a vise began to tremble.", "Then a blade in a vise began to tremble.\n\n" + IMG)]),
    ("n14", "PASS", "reword", 26, [("They make the neighborhood worse for normal tissue and better for the tumor.", "They worsen the neighborhood for normal tissue and improve it for the tumor.")]),
    ("n15", "PASS", "reword", 22, [("Nearly doubled survival is enormous in this context.", "Survival that nearly doubled is huge in this context.")]),
    ("n16", "PASS", "formatting", 6, [("Cortisol rose.", "**Cortisol rose.**")]),
    ("n17", "PASS", "reword", 10, [("The access was rare.", "Such access is rare.")]),
    # ---- FAIL: factual changes ----
    ("p01", "FAIL", "number", 20, [("about 13.2 months", "about 12.3 months")]),
    ("p02", "FAIL", "number", 20, [("about 6.7 months", "about 8.7 months")]),
    ("p03", "FAIL", "number", 10, [("seven epilepsy patients", "nine epilepsy patients")]),
    ("p04", "FAIL", "unit", 10, [("ten to twenty minutes", "ten to twenty hours")]),
    ("p05", "FAIL", "number", 6, [("near-18 Hz", "near-80 Hz")]),
    ("p06", "FAIL", "name", 4, [("Vic Tandy worked", "Vic Landy worked"), ("Tandy laughed", "Landy laughed")]),
    ("p07", "FAIL", "entity", 20, [("an oral multi-selective", "an intravenous multi-selective")]),
    ("p08", "FAIL", "negation", 12, [("remembered nothing from the stream", "remembered much of the stream")]),
    ("p09", "FAIL", "negation", 26, [("stop and still act", "stop and no longer act")]),
    ("p10", "FAIL", "negation", 34, [("This remains a dish model, far from an injured human spinal cord.", "This is no longer only a dish model; it is close to an injured human spinal cord.")]),
    ("p11", "FAIL", "causal", 30, [("Too much prolactin can suppress ovulation.", "Suppressed ovulation can cause too much prolactin.")]),
    ("p12", "FAIL", "causal", 24, [("signals that push neighboring healthy cells to slow down or die", "signals that neighboring healthy cells use to push the tumor cells to slow down or die")]),
    ("p13", "FAIL", "qualifier", 34, [("Adult neurons may carry a repair brake.", "Adult neurons carry a repair brake.")]),
    ("p14", "FAIL", "scope", 16, [("Some dreams behave like a second job.", "All dreams behave like a second job.")]),
    ("p15", "FAIL", "removed", 4, [("His colleagues said the lab felt wrong. They felt watched. ", "")]),
    ("p16", "FAIL", "removed", 20, [("It is often caught late, spreads fast, and has resisted many of the therapies that changed other cancers. ", "")]),
    ("p17", "FAIL", "removed", 12, [(" Words close together in meaning produced related neural patterns.", "")]),
    ("p18", "FAIL", "attribution", 10, [("The [Nature paper]", "The [Science paper]")]),
    ("p19", "FAIL", "attribution", 12, [("a [Scientific American summary]", "a [New Scientist summary]")]),
    ("p20", "FAIL", "magnitude", 22, [("Nearly doubled survival is enormous", "Tripled survival is enormous")]),
    ("p21", "FAIL", "entity", 24, [("as a fruit-fly model of tumors clearing room around themselves", "as a human clinical trial of tumors clearing room around themselves")]),
    ("p22", "FAIL", "polarity", 16, [("exhausted even when standard sleep measures look ordinary", "exhausted because standard sleep measures look abnormal")]),
    ("p23", "FAIL", "negation", 30, [("prolactin returns to normal, and pregnancy becomes possible again", "prolactin stays high, and pregnancy remains impossible")]),
    ("p24", "FAIL", "polarity", 34, [("it improved axon growth", "it blocked axon growth")]),
]

# Prose segment text is unchanged, so the deterministic pre-filter skips judging (zero calls).
PREFILTER_CASES = [("t01", "PASS", "title", "title changed; every prose segment identical"),
                   ("t02", "PASS", "image", "image block added between prose segments; prose segments identical")]


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
    ex = json.loads((EXP / "extraction.json").read_text())
    return {int(k): [p["claim"] for p in v["propositions"] if not is_meta_claim(p["claim"])] for k, v in ex.items()}


def load_cases() -> tuple[list[Case], dict[int, Case]]:
    segs = {s.idx: s for s in segment_article((EXP / "draft-v1.md").read_text())}
    claims = load_claims()
    cases, base = [], {}
    for cid, label, cat, idx, edits in _RAW:
        ref = segs[idx].text
        out = ref
        for find, rep in edits:
            assert out.count(find) == 1, f"{cid}: {find!r} occurs {out.count(find)}x"
            out = out.replace(find, rep)
        assert out != ref, cid
        cases.append(Case(cid, label, cat, idx, tuple(claims[idx]), out, ref))
    for idx in sorted({c.seg for c in cases}):
        base[idx] = Case(f"base{idx}", "PASS", "identity", idx, tuple(claims[idx]), segs[idx].text, segs[idx].text)
    return cases, base
