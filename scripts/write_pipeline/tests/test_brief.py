"""Stage `brief`: deterministic, 400 words at most, and cited by draft, editorial and voice."""
import json

from scripts.write_pipeline import brief as BR
from scripts.write_pipeline import authorprofile as PF
from scripts.write_pipeline.core import NAMES

from .fakes import DRAFT, EDITORIAL, UNSLOP, VOICE


def test_stage_order_has_brief_before_draft_and_fpverify_before_integrity():
    assert NAMES.index("outline") < NAMES.index("brief") < NAMES.index("draft")
    assert NAMES.index("repair") < NAMES.index("fpverify") < NAMES.index("integrity")


def test_brief_is_short_deterministic_and_carries_the_hierarchy_and_author_targets(d):
    d.to_stage("brief")
    rc, out = d.cli("run", "brief")
    assert rc == 0 and out["word_count"] <= BR.MAX_WORDS
    art = json.loads((d.pkg / json.loads((d.pkg / "write-pipeline/state.json").read_text())["stages"]["brief"]["artifact"]).read_text())
    text = art["text"]
    assert len(text.split()) <= 400 and "factual > source/link > semantic > quality > voice > fingerprint" in text
    assert art["hierarchy"] == ["factual", "source/link", "semantic", "quality", "voice", "fingerprint"]
    t = art["targets"]
    assert t["max_list_items"] == 3 and "at most 3 items" in text
    assert t["sentence_words"]["p10"] <= t["sentence_words"]["median"] <= t["sentence_words"]["p90"] and t["paragraph_words"]["median"] > 0
    assert "This isn't X, it's Y" in text and "In conclusion" in text and "Banned vocabulary" in text
    assert "Transitions" in text and "Repetition" in text and "Punctuation habits" in text
    assert t["claims"] == {"use": ["c1", "c2", "c3"], "omit": ["c4"]}  # the evidence map decides what may be asserted
    again = d.cli("run", "brief")[1]
    assert again["cached"] is True and again["brief_sha256"] == out["brief_sha256"]  # deterministic: same inputs, same bytes


def test_author_profile_comes_from_the_frozen_corpus_percentiles():
    prof = PF.author_profile()
    assert prof["n_docs"] >= 50 and 5 < prof["sentence_len"]["p50"] < 30 and prof["sentence_len"]["p10"] < prof["sentence_len"]["p90"]
    assert set(PF.SIGNALS) <= set(prof["bands"]) and prof["bands"]["burstiness"]["p10"] < prof["bands"]["burstiness"]["p90"]


def test_draft_editorial_and_voice_must_cite_the_brief_hash(d):
    d.to_stage("draft")
    want = d.brief_sha()
    rc, out = d.submit("draft", DRAFT, brief=False)
    assert rc == 1 and "brief_sha256" in out["reasons"][0] and want in out["reasons"][0]
    rc, out = d.submit("draft", DRAFT, report={"brief_sha256": "0" * 64}, brief=False)
    assert rc == 1 and "brief_sha256" in out["reasons"][0]
    assert d.submit("draft", DRAFT)[0] == 0
    assert d.submit("validate", DRAFT, report=d.FACTUAL)[0] == 0
    rc, out = d.submit("editorial", EDITORIAL, report=UNSLOP, brief=False)
    assert rc == 1 and "must cite the generation brief" in out["reasons"][0]
    assert d.submit("editorial", EDITORIAL, report=UNSLOP)[0] == 0
    rc, out = d.submit("voice", VOICE, report=UNSLOP, brief=False)
    assert rc == 1 and "brief_sha256" in out["reasons"][0]
    assert d.submit("voice", VOICE, report=UNSLOP)[0] == 0


def test_draft_cannot_start_before_the_brief_and_a_new_brief_stales_the_draft(d):
    d.to_stage("brief")
    rc, out = d.cli("begin", "draft")
    assert rc == 2 and "brief" in out["reason"]
    assert d.cli("run", "brief")[0] == 0
    d.to_stage("antifp")
    ev = dict(d.EVIDENCE, claims=[*d.EVIDENCE["claims"][:3], {**d.EVIDENCE["claims"][3], "claim": "The change will cut hosting costs by 31 percent worldwide"}])
    assert d.submit("research", ev)[0] == 0
    st = {r["stage"]: r["state"] for r in d.cli("status", "--json")[1]["stages"]}
    assert st["brief"] == "STALE" and st["draft"] == "STALE"
