"""The AI disclosure: one italic line right after the TLDR in every flow. Default text is exact; the long variant is built only from true,
logged steps; the evaluator gate freezes it (no claims extracted) and fingerprint measurement skips it."""
import importlib.util
import itertools
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts.fingerprint_eval.rewrite import segment_article
from scripts.write_pipeline import fpcontract as CT
from scripts.write_pipeline import frame as FR
from scripts.write_pipeline import furniture as FU
from scripts.write_pipeline import provenance as PV
from scripts.write_pipeline import verify

from .fakes import BIO_TEXT
from .test_furniture import RN, final, titles
from .test_injection import passed

DEFAULT = "I build agents for a living, and one of them drafted this. The opinions and the edits are mine."
FURN = {"tldr": "One fleet of 40 nodes got quicker after a cache tweak, and its operators credit the tweak.", "read_next": None, "pass_it_on": FU.DEFAULT_PASS_IT_ON, "disclosure": None}
IMG = [{"placement": "hero", "alt": "Two bars", "path": "assets/hero.jpg", "caption": "Bars for the two medians."}]
BODY = "# Old\n\nA lab ran a latency test.\n\n## Section\n\nThe report covers one workload on one fleet.\n"


def steps(outline=False, edit=False, cite=False):
    return SimpleNamespace(outline_supplied=outline, human_edit=edit, citations_checked=cite)


LONG = {
    (False, False, False): "Researched with AI and drafted by my agent.",
    (False, False, True): "Researched with AI and drafted by my agent, with every citation checked.",
    (False, True, False): "Researched with AI and drafted by my agent, then edited by me.",
    (False, True, True): "Researched with AI and drafted by my agent, then edited by me with every citation checked.",
    (True, False, False): "Researched with AI, outlined by me, drafted by my agent.",
    (True, False, True): "Researched with AI, outlined by me, drafted by my agent, with every citation checked.",
    (True, True, False): "Researched with AI, outlined by me, drafted by my agent, then edited by me.",
    (True, True, True): "Researched with AI, outlined by me, drafted by my agent, then edited by me with every citation checked.",
}


def test_default_text_is_exact():
    assert FU.AI_DISCLOSURE == DEFAULT
    assert FU.ai_disclosure("default", steps(True, True, True)) == DEFAULT
    assert FU.disclosure_line_md(DEFAULT) == "*" + DEFAULT + "*"


@pytest.mark.parametrize("flags", list(itertools.product([False, True], repeat=3)))
def test_long_variant_truth_table(flags):
    line = FU.ai_disclosure("long", steps(*flags))
    assert line == LONG[flags]
    outline, edit, cite = flags
    assert ("outlined by me" in line) is outline and ("edited by me" in line) is edit and ("every citation checked" in line) is cite
    assert "Researched with AI" in line and "drafted by my agent" in line and line.endswith(".") and "  " not in line and ",," not in line


def test_long_variant_with_no_steps_object_claims_nothing_optional():
    assert FU.ai_disclosure("long", None) == LONG[(False, False, False)]
    with pytest.raises(ValueError):
        FU.ai_disclosure("loud", steps())


def test_title_json_disclosure_variant_is_optional_and_validated():
    assert FU.check_footer_inputs({"disclosure_variant": "long"}) == [] and FU.check_footer_inputs({}) == []
    assert any("disclosure_variant" in r for r in FU.check_footer_inputs({"disclosure_variant": "loud"}))
    assert FU.from_title({"tldr": "x"})["disclosure_variant"] == "default" and FU.from_title({"tldr": "x", "disclosure_variant": "long"})["disclosure_variant"] == "long"


def assembled(line=DEFAULT):
    return FR.assemble(BODY, "A title about caches", "A subtitle about scope", IMG, FURN, BIO_TEXT, disclosure=line)


def test_the_line_is_an_italic_paragraph_right_after_the_tldr():
    t = assembled()
    assert f"> {FURN['tldr']}\n\n*{DEFAULT}*\n\nA lab ran a latency test." in t
    assert "*" + DEFAULT not in assembled(None) and DEFAULT not in assembled(None)


def test_verify_checks_the_line_verbatim_and_its_position():
    furn = {**FURN, "ai_disclosure": DEFAULT}
    t = assembled()
    assert FU.verify(t, furn, BIO_TEXT) == []
    assert any("disclosure" in r for r in FU.verify(t.replace(f"*{DEFAULT}*\n\n", ""), furn, BIO_TEXT))
    assert any("disclosure" in r for r in FU.verify(t.replace("mine.", "mine!"), furn, BIO_TEXT))
    moved = t.replace(f"*{DEFAULT}*\n\n", "").replace("## Section\n\n", f"## Section\n\n*{DEFAULT}*\n\n")
    assert any("disclosure" in r for r in FU.verify(moved, furn, BIO_TEXT))
    assert FU.verify(assembled(None), {**FURN}, BIO_TEXT) == []  # a furniture without a disclosure line asks for none


def test_the_footer_never_carries_disclosure_text_even_when_the_field_matches_the_line():
    furn = {**FURN, "ai_disclosure": DEFAULT, "disclosure": DEFAULT}
    assert DEFAULT not in FU.footer_md(furn, BIO_TEXT)
    assert DEFAULT not in FU.footer_md({**furn, "disclosure": f"*{DEFAULT}*"}, BIO_TEXT)


def test_footer_disclosure_input_is_empty_or_exactly_an_allowed_ai_sentence():
    allowed = FU.allowed_disclosures()
    assert allowed[0] == DEFAULT and set(LONG.values()) <= set(allowed) and len(allowed) == 9
    for ok in (None, DEFAULT, f"*{DEFAULT}*", *LONG.values()):
        assert FU.check_footer_inputs({"disclosure": ok}) == [], ok
    for bad in ("The lab proved this works for everyone.", DEFAULT + " The lab proved this works for everyone.", "Disclosure: " + DEFAULT,
                DEFAULT.replace("mine.", "mine!"), "", "   ", 5, DEFAULT + "\n\nThe lab proved this works for everyone."):
        if bad in ("", "   "):
            assert FU.check_footer_inputs({"disclosure": bad}) == [], repr(bad)  # empty means omitted
        else:
            assert any("disclosure must be omitted" in r or "one line" in r for r in FU.check_footer_inputs({"disclosure": bad})), repr(bad)


def test_the_claim_free_text_disclosure_from_the_review_is_rejected():
    assert FU.check_footer_inputs({"disclosure": "The lab proved this works for everyone."})  # failing input of the review: it rendered frozen and was never claims-checked


def test_verify_rejects_an_appended_text_disclosure():
    furn = {**FURN, "ai_disclosure": DEFAULT}
    t = assembled().replace(f"*{DEFAULT}*", f"*{DEFAULT}* The lab proved this works for everyone.")
    assert any("AI disclosure line" in r for r in FU.verify(t, furn, BIO_TEXT))


def test_verify_rejects_multiple_disclosure_paragraphs():
    furn = {**FURN, "ai_disclosure": DEFAULT}
    t = assembled()
    twice = t.replace(f"*{DEFAULT}*\n\n", f"*{DEFAULT}*\n\n*{DEFAULT}*\n\n")
    assert any("appears 2 times" in r for r in FU.verify(twice, furn, BIO_TEXT))
    in_body = t.replace("## Section\n\n", f"## Section\n\n*{LONG[(False, False, False)]}*\n\n")
    assert any("appears 2 times" in r for r in FU.verify(in_body, furn, BIO_TEXT))
    in_footer = t.rstrip("\n") + f"\n\n*{DEFAULT}*\n"
    assert any("disclosure" in r for r in FU.verify(in_footer, furn, BIO_TEXT))


def test_verify_rejects_a_disclosure_in_the_wrong_position_and_one_nobody_asked_for():
    furn = {**FURN, "ai_disclosure": DEFAULT}
    t = assembled()
    moved = t.replace(f"*{DEFAULT}*\n\n", "").replace("## Section\n\n", f"## Section\n\n*{DEFAULT}*\n\n")
    assert any("right after the TLDR" in r for r in FU.verify(moved, furn, BIO_TEXT))
    assert any("none was requested" in r for r in FU.verify(t, {**FURN}, BIO_TEXT))  # the frozen pattern is valid only as the requested line


@pytest.mark.parametrize("line", [DEFAULT, LONG[(True, True, True)], LONG[(False, False, False)]])
def test_the_gate_freezes_the_line_and_extracts_no_claims_from_it(line):
    segs = segment_article(assembled(line))
    hit = [s for s in segs if s.text.strip() == f"*{line}*"]
    assert len(hit) == 1 and hit[0].frozen and not hit[0].tldr and not hit[0].caption
    assert next(s for s in segs if s.tldr).frozen is False  # the TLDR stays editable prose


def test_a_reworded_line_is_not_frozen_by_the_disclosure_pattern():
    segs = segment_article(assembled("I build agents for a living, and one of them drafted this. The opinions and the edits are ours."))
    assert not [s for s in segs if "drafted this" in s.text and s.frozen]


@pytest.mark.parametrize("line", [DEFAULT, LONG[(True, True, True)]])
def test_fingerprint_measurement_skips_the_line(line):
    from scripts.write_pipeline import authorprofile as PF
    a, b = assembled(None), assembled(line)
    assert CT.signals(a) == CT.signals(b)
    assert PF.measure(a)["n_words"] == PF.measure(b)["n_words"]


def test_the_hermes_narrative_gate_drops_a_single_italic_line():
    p = Path.home() / ".hermes/skills/medium-article-pipeline-ops/scripts/medium-narrative-gate.py"
    if not p.exists():
        pytest.skip("narrative gate script not on this machine")
    spec = importlib.util.spec_from_file_location("narr", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert not any("drafted this" in x for x in m.prose_paragraphs(assembled()))


# ---- provenance: facts come from hash-bound artifacts, never from flags or log lines ---------------------------------------
def test_steps_assume_nothing_on_a_fresh_pipeline(d):
    from scripts.write_pipeline.core import Pipeline
    d.cli("init")
    s = PV.steps(Pipeline(d.pkg))
    assert (s.outline_supplied, s.human_edit, s.citations_checked) == (False, False, False)


def test_citations_checked_follows_the_validate_stage(d):
    from scripts.write_pipeline.core import Pipeline
    d.to_stage("validate")
    assert PV.steps(Pipeline(d.pkg)).citations_checked is False
    d.to_stage("editorial")
    assert PV.steps(Pipeline(d.pkg)).citations_checked is True


def _with_human(d, **over):
    from .fakes import ANSWERED
    from scripts.write_pipeline.core import Pipeline
    d.human = {**ANSWERED, **over}
    d.to_stage("outline")
    return Pipeline(d.pkg)


def test_outline_supplied_comes_only_from_the_answered_human_artifact(d):
    assert PV.steps(_with_human(d, outline_supplied=True)).outline_supplied is True


def test_an_answered_record_without_an_outline_does_not_claim_one(d):
    assert PV.steps(_with_human(d, outline_supplied=False)).outline_supplied is False


def test_a_no_answer_record_does_not_claim_one(d):
    from .fakes import NO_ANSWER
    d.human = dict(NO_ANSWER)
    d.to_stage("outline")
    from scripts.write_pipeline.core import Pipeline
    assert PV.steps(Pipeline(d.pkg)).outline_supplied is False


def test_a_fabricated_state_flag_or_log_fact_never_produces_outlined_or_edited_by_me(d):
    pipe = _with_human(d, outline_supplied=False)
    pipe.state["provenance"] = {"outline_supplied": True, "human_edit": True}  # the old flag path
    pipe.log("provenance_fact", fact="human_edit")  # the old log path: {"event": "provenance_fact"}
    pipe.log("provenance_fact", fact="outline_supplied")
    pipe.save()
    s = PV.steps(pipe)
    assert (s.outline_supplied, s.human_edit) == (False, False)
    line = FU.ai_disclosure("long", s)
    assert "outlined by me" not in line and "edited by me" not in line


def test_a_tampered_human_artifact_loses_the_outline_claim(d):
    pipe = _with_human(d, outline_supplied=False)
    art = d.pkg / pipe.rec("human")["artifact"]
    art.write_text(art.read_text().replace('"outline_supplied": false', '"outline_supplied": true'))  # edited after the state recorded its sha
    assert json.loads(art.read_text())["outline_supplied"] is True
    assert PV.steps(pipe).outline_supplied is False  # status is no longer DONE and the sha no longer matches


def test_human_edit_is_always_false_even_after_a_revalidate_adopted_an_edit(d):
    pipe = _with_human(d, outline_supplied=True)
    pipe.state["candidate"] = {"path": "x", "sha256": "0" * 64, "origin": "user-edit"}
    pipe.state["user_modified"] = {"adopted_sha256": "0" * 64}
    assert PV.steps(pipe).human_edit is False


# ---- end to end through the pipeline ------------------------------------------------------------------------------------
def test_every_flow_ships_the_line_after_the_tldr_and_verify_catches_tampering(d):
    d.TITLES = titles(d, read_next=RN)
    passed(d)
    t = final(d)
    tl = FU.tldr_md({"tldr": d.TITLES["tldr"]})
    assert f"{tl}\n\n*{DEFAULT}*\n\n" in t
    from scripts.write_pipeline.core import Pipeline
    assert not any("disclosure" in x for x in verify.final_failures(Pipeline(d.pkg), d.runner))
    (d.pkg / "FINAL.md").write_text(t.replace(f"*{DEFAULT}*\n\n", ""))
    assert any("AI disclosure" in x for x in verify.final_failures(Pipeline(d.pkg), d.runner))


def test_the_long_variant_in_the_title_json_is_rendered_from_logged_steps(d):
    d.TITLES = titles(d, read_next=RN, disclosure_variant="long")
    passed(d)
    assert f"*{LONG[(False, False, True)]}*" in final(d)  # validate is DONE, no outline or human edit is recorded


def test_the_long_variant_says_outlined_by_me_only_with_an_answered_outline(d):
    from .fakes import ANSWERED
    d.human = {**ANSWERED, "outline_supplied": True}
    d.TITLES = titles(d, read_next=RN, disclosure_variant="long")
    passed(d)
    assert f"*{LONG[(True, False, True)]}*" in final(d)  # outline from the hash-bound human artifact, validate DONE, no human edit mechanism
