"""The TLDR, the hero caption and the subtitle are frame, not argument: they must not restate the body (a shared normalized 6-word run, or more
than 20 percent of their 4-grams found in the body)."""
import json
from pathlib import Path

import pytest

from scripts.write_pipeline import furniture as FU
from scripts.write_pipeline import validators as V

BODY = ("A lab ran a latency test on 40 nodes in 2025 and published the numbers in its test report. Median latency fell from 120 ms to 85 ms after the change.\n\n"
        "## What the test measured\n\nThe report describes the setup briefly. Each node served the same request mix before and after the change, and the team compared medians.\n")
FRESH = "One fleet of 40 nodes got quicker after a cache tweak, and its operators credit the tweak. Whether your own traffic gains as much is the open question."
SIX_RUN = "Short intro here. Each node served the same request mix before it ended, and nobody objected to that framing at all in the end."
GRAMS = "The team compared medians. The report describes the setup. Each node served the same. A latency fell from 120 ms."


def test_fresh_wording_passes():
    assert FU.restates_body(FRESH, BODY) is None


def test_a_shared_six_word_run_is_rejected():
    why = FU.restates_body(SIX_RUN, BODY)
    assert why and "6" in why


def test_four_gram_overlap_share_above_a_fifth_is_rejected():
    why = FU.restates_body(GRAMS, BODY)
    assert why and "4-gram" in why


def test_normalization_ignores_case_and_punctuation():
    assert FU.restates_body("EACH, NODE; served: THE same request MIX", BODY)
    assert FU.restates_body("Each node: served the same request mix before.", BODY)


def test_markdown_links_do_not_hide_a_restatement():
    assert FU.restates_body("Each node served the [same request](https://x.org/a) mix before and after", BODY)


def test_a_text_without_four_words_never_restates():
    assert FU.restates_body("Too short", BODY) is None


def test_check_tldr_rejects_a_restating_tldr():
    ok = FU.check_tldr(FRESH, BODY)
    assert not any("restates" in r for r in ok)
    bad = FU.check_tldr("Median latency fell from 120 ms to 85 ms after the change, and the lab ran a latency test on 40 nodes in 2025 to show it happened.", BODY)
    assert any("restates the body" in r for r in bad)


def test_the_subtitle_is_checked_in_the_title_stage():
    data = {"candidates": [f"A distinct title candidate number {i} about caches" for i in range(10)], "pick": "A distinct title candidate number 1 about caches",
            "rationale": "x", "subtitle": "Median latency fell from 120 ms to 85 ms after the change on 40 nodes in 2025", "tldr": FRESH}
    out = V.titles(data, BODY)
    assert any("subtitle" in r and "restates the body" in r for r in out["reasons"]), out["reasons"]


def test_caption_edit_must_not_restate_the_body():
    ref = "# T\n\n### S\n\n![alt text here](assets/hero.jpg)\n\n*A plain caption of the chart.*\n\n> " + FRESH + "\n\n" + BODY
    cand = ref.replace("*A plain caption of the chart.*", "*Each node served the same request mix before and after the change.*")
    assert any("hero caption" in r and "restates the body" in r for r in FU.furniture_edit_reasons(ref, cand))
    assert FU.furniture_edit_reasons(ref, ref.replace("A plain caption of the chart.", "Bars for the two medians.")) == []


def test_v5_tldr_restates_its_body():
    pkg = Path.home() / "Desktop/medium-article-one-book-v5"
    final = pkg / "FINAL.md"
    if not final.exists():
        pytest.skip("v5 package not on this machine")
    from scripts.write_pipeline.core import strip_not_ready_banner
    text = strip_not_ready_banner(final.read_text())[0]
    tldr = FU.tldr_text(text)
    core, _ = FU.split_footer(text)
    blocks, _, tl, foot = FU.head_parts(core)
    body = "\n\n".join(b.text for b in blocks[tl + 1:])
    assert FU.restates_body(tldr, body)
    assert any("restates the body" in r for r in FU.check_tldr(tldr, body))
