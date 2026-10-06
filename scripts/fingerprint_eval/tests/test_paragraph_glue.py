"""Sentence segmentation is per block: a paragraph ending in a citation is never glued to the next paragraph's first sentence.
Fixture text is the minimal real failing pair from the medium-article-one-book-v2 repair report."""
from scripts.fingerprint_eval import added
from scripts.fingerprint_eval.textutil import split_sentences, strip_inline

P1 = ("Where an outcome was favourable, participants rated the thinking as better, rated the decision maker as more competent, and reported "
      "more willingness to let that person decide for them. ([Baron and Hershey, Journal of Personality and Social Psychology]"
      "(https://www.sas.upenn.edu/~baron/papers/outcomebias.pdf))")
P2 = "Then the researchers asked whether outcomes should enter those ratings at all. Most said they should not. They had already let the outcome in."
ART = f"# T\n\n## S\n\n{P1}\n\n{P2}\n"


def test_final_sentences_never_cross_a_paragraph_break():
    sents = [s for seg in added.segment_article(ART) for b in seg.blocks for s in split_sentences(strip_inline(b.text))]
    assert not any("Baron and Hershey" in s and "Then the researchers" in s for s in sents)
    assert "Then the researchers asked whether outcomes should enter those ratings at all." in sents


def test_unchanged_citation_paragraph_adds_no_phantom_sentence():
    assert added.new_sentences(ART, ART) == {}


def test_cuts_only_candidate_adds_nothing():
    cand = ART.replace(" Most said they should not.", "")
    assert added.new_sentences(ART, cand) == {}


def test_trailing_citation_is_a_sentence_end_inside_one_paragraph():
    raw = "It rose in 2020. ([Source](https://a.example/x)) Then it fell. [Other](https://b.example/y) Next one."
    assert split_sentences(raw) == ["It rose in 2020. ([Source](https://a.example/x))", "Then it fell. [Other](https://b.example/y)", "Next one."]
    assert split_sentences(strip_inline("It rose in 2020. ([Source](https://a.example/x)) Then it fell.")) == ["It rose in 2020. (Source)", "Then it fell."]
