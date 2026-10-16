"""Advisory GPTZero/Winston pattern detectors: every flagged sentence is caught, every human-rated sentence is not."""
import json
from pathlib import Path

import pytest

from scripts.fingerprint_eval import patterns as P

FIX = json.loads((Path(__file__).parent / "fixtures" / "detector_flags.json").read_text())
SENTENCE_LEVEL = sorted(set(P.PATTERNS) - {"rhythm_uniformity"})


def counts(md):
    return {k: v["count"] for k, v in P.detect(md).items()}


@pytest.mark.parametrize("row", FIX["flagged"], ids=[f"{r['pattern']}-{i}" for i, r in enumerate(FIX["flagged"])])
def test_every_flagged_sentence_is_caught_by_its_pattern(row):
    out = P.detect(row["text"])
    assert out[row["pattern"]]["count"] >= 1, (row, out)
    assert out[row["pattern"]]["examples"]


@pytest.mark.parametrize("text", FIX["human"])
def test_human_rated_sentences_are_not_caught(text):
    assert {k: v for k, v in counts(text).items() if v} == {}


def test_detect_returns_every_pattern_with_count_and_examples():
    out = P.detect("Plain sentence here.")
    assert set(out) == set(P.PATTERNS)
    assert all(set(v) >= {"count", "examples"} for v in out.values())


def test_quotes_blockquotes_code_and_link_text_are_ignored():
    s = "I've seen versions of this problem in software."
    md = (f'> {s}\n\n```\n{s}\n```\n\nShe wrote "{s}" in the margin.\n\n'
          f"See [{s}](https://example.com/a) for more.\n")
    assert counts(md)["vague_experience"] == 0
    assert counts(s)["vague_experience"] == 1


def test_vague_experience_needs_no_concrete_detail():
    assert counts("I've seen versions of this problem at Stripe in 2019.")["vague_experience"] == 0
    assert counts("I've watched this before, and it ends the same way.")["vague_experience"] == 1
    assert counts("We have seen versions of this at 3 clients.")["vague_experience"] == 0


def test_dramatic_closer_is_specific_not_finding_out():
    assert counts("Now some are finding out that adoption was the easy part.")["dramatic_closer"] == 0
    assert counts("The companies are finding out now, because the metric finally flipped.")["dramatic_closer"] == 1


def test_stacked_hedges_needs_two_hedges_in_one_sentence():
    assert counts("The result is probably right.")["stacked_hedges"] == 0
    assert counts("The result is probably right, though it may arguably be a fluke.")["stacked_hedges"] == 1


def test_so_closer_and_logic_framing_are_separate_signals():
    c = counts("So the whole thing hinges on cost.")
    assert c["so_closer"] == 1 and c["logic_framing"] == 1
    assert counts("So I bought a bike.")["so_closer"] == 0


def test_setup_correct_uses_a_two_sentence_window():
    two = "Many people assume the tool saved money. The evidence does not support that."
    assert counts(two)["setup_correct"] == 1
    far = "Many people assume the tool saved money. It was purchased in May. The evidence does not support that."
    assert counts(far)["setup_correct"] == 0


def test_plain_lists_are_not_clause_triples():
    assert counts("We sell apples, pears, and plums to the market every week.")["clause_triple"] == 0


UNIFORM = "\n\n".join(
    f"Teams adopted tool number {n} across the whole business very quickly. The numbers after a year showed little change in output at all. That was the point." for n in range(8))
VARIED = "\n\n".join([
    "Short one.", "This paragraph has a good deal more to say, running on through several clauses before it ends, and then it ends.",
    "Two sentences here. The second is a lot longer than the first one is, by a wide margin, in fact.",
    "A single sentence that stands alone.", "Three short ones. Then a bit longer than that one was, really. Done.",
    "One more, long enough to count as a different shape from the others that came before it today.",
    "Tiny.", "Another medium sentence follows this. And then a third that is much, much longer than the two before it, going on for a while."])


def test_rhythm_uniformity_flags_one_dominant_paragraph_shape():
    assert P.detect(UNIFORM)["rhythm_uniformity"]["count"] >= 6
    assert P.detect(VARIED)["rhythm_uniformity"]["count"] == 0


def test_readability_reports_flesch_grade_and_long_sentence_share():
    r = P.readability("The cat sat. It was a good cat. Word " + "word " * 30 + "end.")
    assert set(r) >= {"flesch", "grade", "long_sentence_share", "n_sentences"}
    assert r["long_sentence_share"] == pytest.approx(1 / 3, abs=0.01)
    assert P.readability("")["n_sentences"] == 0


def test_patterns_are_advisory_never_in_the_composite():
    from scripts.fingerprint_eval import metrics as FM
    from scripts.write_pipeline import fpcontract as C
    assert not set(P.PATTERNS) & {n for n, _ in FM.TEMPLATES}
    assert not set(P.PATTERNS) & set(C.WEIGHTS)
    sig = C.signals("So the whole thing hinges on cost.")
    assert set(sig["patterns"]["counts"]) == set(P.PATTERNS) and sig["patterns"]["counts"]["so_closer"] == 1
    assert "patterns" not in sig["values"]


def test_signals_composite_ignores_pattern_hits():
    from scripts.write_pipeline import fpcontract as C
    base = "The table was set for four people at noon today."
    flagged = base + " So the whole thing hinges on cost."
    a, b = C.signals(base), C.signals(flagged)
    assert b["patterns"]["counts"]["so_closer"] == 1 and a["patterns"]["counts"]["so_closer"] == 0
    assert set(b["values"]) == set(C.WEIGHTS)


BODY = ("The table was set for four people at noon today. Rain had stopped an hour before, and the street smelled of wet stone.\n\n"
        "Nobody spoke for a while. The kettle ticked as it cooled, and a bus went by outside.")


def test_fpcaps_check_reports_pattern_offenders_as_advisory():
    from scripts.write_pipeline import fpcaps
    res = fpcaps.check(BODY + "\n\nSo the whole thing hinges on cost. It is a plain bet on one number.")
    assert res["ok"] is True  # advisory: never makes a text fail
    assert res["advisory"]["patterns"]["so_closer"]["count"] == 1
    assert res["advisory"]["patterns"]["so_closer"]["examples"]


def test_author_corpus_rates_stay_low():
    """Calibration guard: Max's own pre-2023 writing (frozen corpus) must not trip the detectors, per 1000 words."""
    from scripts.fingerprint_eval.contracts import AUTHOR_CORPUS_DIR
    root = Path(__file__).resolve().parents[3] / AUTHOR_CORPUS_DIR
    files = sorted(root.glob("*.txt"))
    assert len(files) >= 50
    total = {k: 0 for k in P.PATTERNS}
    n = 0
    for f in files:
        t = f.read_text()
        n += P.n_words(t)
        for k, v in P.counts(t).items():
            total[k] += v
    rate = {k: 1000 * v / n for k, v in total.items()}
    assert max(rate.values()) < 0.2, rate
