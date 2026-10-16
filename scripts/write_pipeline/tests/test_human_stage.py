"""The human input stage: pause, skip, resume, late answer, artifact names, require mode, schema."""
import json

from scripts.write_pipeline import humaninput as HI

from .fakes import ANSWERED, NO_ANSWER

FILLED = """# HUMAN_INPUT

status: answered
method: text
outline_supplied: yes
asked_at: 2026-10-16T09:00:00+00:00
answered_at: 2026-10-16T09:30:00+00:00
transcript_file:

## experience
Question: anything
Answer:
In March 2025 I tested a cache change on my own fleet of 12 servers and the median dropped.

## opinion
Question: anything
Answer:
I think a single published run is weak evidence for any other workload.

## detail_or_outline
Question: anything
Answer:
1. Setup
2. Result on Redis
"""


def st(d):
    return d.cli("status", "--json")[1]


def by(d):
    return {r["stage"]: r["state"] for r in st(d)["stages"]}


def test_pause_the_outline_waits_for_the_human_stage_and_begin_asks_three_questions(d):
    d.to_stage("human")
    assert d.cli("next")[1]["next"] == "human"
    rc, out = d.cli("begin", "outline")
    assert rc == 2 and out["action"] == "wait" and "human" in out["reason"]
    rc, out = d.cli("begin", "human")
    assert rc == 0 and out["action"] == "run" and len(out["questions"]) == 3
    assert "experience" in out["questions"][0] and "opinion" in out["questions"][1] and "outline" in out["questions"][2]


def test_skip_no_answer_is_recorded_and_the_run_continues_without_first_person(d):
    d.to_stage("human")
    rc, out = d.submit("human", NO_ANSWER)
    assert rc == 0 and out["ok"] and out["artifact"].endswith("03h-human.json")
    assert d.submit("outline", d.OUTLINE)[0] == 0
    rc, out = d.cli("run", "brief")
    assert rc == 0
    art = json.loads((d.pkg / "write-pipeline/artifacts/05-brief.json").read_text())
    assert art["targets"]["first_person_per_1k"] == 0 and "No first-person experience" in art["text"]
    state = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    assert state["provenance"]["outline_supplied"] is False


def test_unattended_flow_human_ask_writes_the_file_and_submitting_it_unchanged_is_no_answer(d):
    d.to_stage("human")
    rc, out = d.cli("human", "ask")
    assert rc == 0 and len(out["questions"]) == 3
    p = d.pkg / "HUMAN_INPUT.md"
    assert p.exists() and "status: no_answer" in p.read_text()
    rc, out = d.cli("submit", "human", "--file", str(p))
    assert rc == 0, out
    assert json.loads((d.pkg / "write-pipeline/artifacts/03h-human.json").read_text())["status"] == "no_answer"
    assert HI.parse_md(p.read_text())["status"] == "no_answer"


def test_resume_answered_md_is_stored_with_the_outline_provenance_and_feeds_notes_and_numbers(d):
    d.to_stage("human")
    p = d.pkg / "HUMAN_INPUT.md"
    p.write_text(FILLED)
    rc, out = d.cli("submit", "human", "--file", str(p))
    assert rc == 0, out
    art = json.loads((d.pkg / "write-pipeline/artifacts/03h-human.json").read_text())
    assert art["status"] == "answered" and art["outline_supplied"] is True and "Redis" in art["answers"]["detail_or_outline"]
    assert json.loads((d.pkg / "write-pipeline/state.json").read_text())["provenance"]["outline_supplied"] is True
    from scripts.write_pipeline import runs as RN
    from scripts.write_pipeline.core import Pipeline
    from scripts.write_pipeline.submit import deps_ctx
    pipe = Pipeline(d.pkg)
    assert "median dropped" in RN.notes_text(pipe) and "Redis" in RN.notes_text(pipe)  # the claims gate sees the answers
    assert deps_ctx(pipe)["blob_numbers"]["2025"] >= 1 and deps_ctx(pipe)["author_material"] is True


def test_late_answer_marks_outline_and_everything_downstream_stale_and_keeps_artifact_names(d):
    d.to_stage("critic")
    before = by(d)
    assert before["human"] == "DONE" and before["outline"] == "DONE"
    p = d.pkg / "HUMAN_INPUT.md"
    p.write_text(FILLED)
    rc, out = d.cli("submit", "human", "--file", str(p))
    assert rc == 0 and out["cached"] is False
    after = by(d)
    assert after["human"] == "DONE" and after["angle"] == "DONE"
    from scripts.write_pipeline.core import NAMES
    assert all(after[n] == "STALE" for n in NAMES[NAMES.index("outline"):if_done(before, NAMES)])
    art = d.pkg / "write-pipeline/artifacts"
    for n in ("03h-human.json", "04-outline.json", "05-brief.json", "06-draft.md", "07-validate.md", "08-editorial.md", "09-voice.md", "13-images.reference-frame.md"):
        assert (art / n).exists(), n
    assert d.cli("next")[1]["next"] == "outline"


def if_done(before, names):
    return max(i for i, n in enumerate(names) if before[n] == "DONE") + 1


def test_second_change_of_the_human_answer_is_an_upstream_rework_refused(d):
    d.to_stage("critic")
    assert d.submit("human", ANSWERED)[0] == 0  # the one allowed rework: no_answer -> answered
    rc, out = d.submit("human", dict(ANSWERED, answers=dict(ANSWERED["answers"], opinion="I think something else entirely about this.")))
    assert rc == 3 and out["code"] == "NOT_READY" and "rework limit" in out["reasons"][0]


def test_require_mode_blocks_on_no_answer_with_exit_4_and_accepts_an_answer(d, monkeypatch):
    monkeypatch.setenv("WRITE_PIPELINE_HUMAN", "require")
    d.to_stage("human")
    rc, out = d.submit("human", NO_ANSWER)
    assert rc == 4 and out["code"] == "BLOCKED_INPUT" and len(out["questions"]) == 3
    assert by(d)["human"] == "BLOCKED" and d.submit("outline", d.OUTLINE)[0] == 2
    rc, out = d.submit("human", ANSWERED)
    assert rc == 0 and by(d)["human"] == "DONE"


def test_schema_rules():
    ok = HI.validate(dict(ANSWERED))
    assert ok["ok"], ok
    bad = lambda **kw: HI.validate({**ANSWERED, **kw})["reasons"]  # noqa: E731
    assert bad(status="maybe")
    assert any("non-empty" in r for r in bad(answers={**ANSWERED["answers"], "opinion": ""}))
    assert any("answered_at" in r for r in HI.validate({k: v for k, v in ANSWERED.items() if k != "answered_at"})["reasons"])
    assert any("transcript_file" in r for r in bad(method="voice"))
    assert bad(outline_supplied="yes")
    assert bad(status="no_answer")  # no_answer must carry empty answers
    assert HI.validate(dict(NO_ANSWER))["ok"]
    assert bad(extra_key=1)


def test_voice_answer_stores_the_transcript_inside_the_package_and_hashes_it(d):
    d.to_stage("human")
    (d.pkg / "transcripts").mkdir()
    (d.pkg / "transcripts" / "voice-1.txt").write_text("In March 2025 I tested a cache change on my own fleet of 12 servers.")
    rc, out = d.submit("human", {**ANSWERED, "method": "voice", "transcript_file": "transcripts/voice-1.txt"})
    assert rc == 0, out
    rec = json.loads((d.pkg / "write-pipeline/state.json").read_text())["stages"]["human"]
    assert "transcripts/voice-1.txt" in rec["files"]
    rc, out = d.submit("human", {**ANSWERED, "method": "voice", "transcript_file": "../escape.txt"}, name="h2.json")
    assert rc == 1
