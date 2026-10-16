"""Experience trace gate: a first-person experience sentence passes only when the author's answers (or a captured author source) back it."""
import pytest

from scripts.write_pipeline import experience as EX
from scripts.write_pipeline import humaninput as HI

from .fakes import ANSWERED, DRAFT, NO_ANSWER

INVENTED = "I've seen versions of this problem in software."
TRACED = "In March 2025 I tested a cache change on my own fleet of 12 servers and the median dropped."


def para(s: str) -> str:
    return f"# Title\n\nSome neutral opening sentence about latency.\n\n{s}\n"


def test_wide_pattern_finds_what_mdlib_experience_misses():
    from scripts.write_pipeline import mdlib as M
    assert not M.EXPERIENCE.search("I debugged this twice last year.")
    assert EX.experience_sentences(para("I debugged this twice last year."))
    assert not EX.experience_sentences(para("I need a better answer here."))  # 'need' is not a past-tense claim
    assert not EX.experience_sentences(para("The lab ran the test on 40 nodes."))


def test_invented_sentence_fails_with_no_answer():
    bad = EX.untraced(para(INVENTED), NO_ANSWER, [])
    assert [b["sentence"] for b in bad] == [INVENTED] and "no human answer" in bad[0]["reason"]


def test_invented_sentence_fails_when_the_answers_do_not_mention_it():
    bad = EX.untraced(para(INVENTED), ANSWERED, [])
    assert [b["sentence"] for b in bad] == [INVENTED] and "content words" in bad[0]["reason"]


def test_any_author_source_no_longer_lets_every_sentence_through():
    assert EX.untraced(para(INVENTED), NO_ANSWER, ["Author note: the fleet runs 40 nodes in two regions."])


def test_traced_sentence_passes():
    assert EX.untraced(para(TRACED), ANSWERED, []) == []


def test_number_or_name_missing_from_the_answers_fails():
    assert EX.untraced(para(TRACED.replace("12 servers", "40 servers")), ANSWERED, [])[0]["reason"].startswith("number or name")
    assert EX.untraced(para("I tested a cache change on my own fleet of 12 servers using Kafka."), ANSWERED, [])
    assert EX.untraced(para("I tested a cache change on my own fleet of 12 servers using Redis."), ANSWERED, []) == []


def test_a_captured_author_source_can_trace_a_sentence():
    src = ["Author note: I ran this change on my own fleet last spring and saw the same drop."]
    assert EX.untraced(para("When I tested this on my own fleet, the numbers matched."), NO_ANSWER, src) == []


def test_quotes_headings_code_and_the_italic_line_are_not_checked():
    md = "# Title\n\n> I've seen it all in my team.\n\n*I built agents for a living.*\n\nText.\n\n```\nI tested it\n```\n\n## I tested things\n"
    assert EX.experience_sentences(md) == []


@pytest.mark.parametrize("stage", ["draft"])
def test_draft_stage_rejects_an_untraced_sentence_even_with_author_material(d, stage):
    d.cli("init")
    (d.pkg / "sources").mkdir(parents=True, exist_ok=True)
    (d.pkg / "sources" / "source-002.md").write_text("Author note: the fleet runs 40 nodes in two regions.\n")
    src = d.sources()
    src["sources"].append({"id": "s2", "kind": "author", "status": "captured", "file": "sources/source-002.md"})
    assert d.submit("source", src)[0] == 0
    for st, body in (("research", d.EVIDENCE), ("angle", d.ANGLE), ("human", d.human), ("outline", d.OUTLINE)):
        assert d.submit(st, body)[0] == 0
    d.cli("run", "brief")
    rc, out = d.submit("draft", DRAFT + "\n" + INVENTED + "\n")
    assert rc == 1 and any(r.startswith("experience trace") for r in out["reasons"])


def test_answered_human_input_lets_the_traced_sentence_through_every_stage(d):
    d.human = dict(ANSWERED)
    d.texts["draft"] = d.texts["validate"] = d.texts["editorial"] = d.texts["voice"] = DRAFT + "\n" + TRACED + "\n"
    d.to_stage("review")  # draft, validate, editorial, voice and antifp all carried the sentence through edit_guard and the trace


def test_repair_try_rejects_an_untraced_experience_sentence(d):
    from .test_repair_adds import TAIL, candidate, major_open, try_repair
    d.human = dict(ANSWERED)
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(TAIL, TAIL + " " + INVENTED))
    assert rc == 1 and any("experience trace" in r for r in out["reasons"]), out
