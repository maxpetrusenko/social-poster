"""The critic sees the ledger WITH its evidence passages and the relevant captured-source excerpts; an 'unsupported' major whose quoted text is in
the evidence is rebutted deterministically and does not count against READY."""
import json

from scripts.write_pipeline import criticev as CE

from .fakes import SOURCE_TEXT, Driver


def _other(d):
    p = d.tmp.parent / (d.tmp.name + "-other")
    p.mkdir()
    return p


def run_critic(d, findings, verdict="revise"):
    d.to_stage("critic")
    d.critic.replies = [{"verdict": verdict, "findings": findings}]
    rc, out = d.cli("run", "critic")
    art = json.loads((d.pkg / json.loads((d.pkg / "write-pipeline/state.json").read_text())["stages"]["critic"]["artifact"]).read_text())
    return out, art


def test_the_critic_prompt_carries_evidence_passages_and_source_excerpts(d):
    run_critic(d, [], verdict="pass")
    prompt = d.critic.prompts[0]
    ledger = prompt.split("=== EVIDENCE LEDGER", 1)[1].split("=== ARTICLE ===", 1)[0]
    assert "evidence passage" in ledger and "ran the test on 40 nodes" in ledger        # the ledger row's own passage
    assert "source excerpt" in ledger and "The team said the cache was the cause" in ledger  # the captured source text that bears on it
    assert "verify it against the evidence ledger" in prompt and "do not report it" in prompt  # the instruction to check the passages first
    assert "[unresolved] c4" in ledger and "evidence passage" not in ledger.split("c4:")[1].split("\n- ")[0]


def test_ledger_view_truncates_per_claim_and_overall():
    ev = {"claims": [{"id": f"c{i}", "claim": "Widgets scale linearly", "status": "supported", "evidence": [{"url": "u", "passage": "widgets scale linearly " * 400}] * 5}
                     for i in range(200)]}
    view = CE.ledger_view(ev, [("sources/s.md", "Widgets scale linearly in the lab. " * 500)])
    block = view.split("\n- ")[1]
    assert block.count("evidence passage") == CE.PASSAGES_PER_CLAIM and all(len(x) <= CE.PASSAGE_CAP + 120 for x in block.split("\n"))
    assert len(view) <= CE.LEDGER_MAX_CHARS + 200 and "ledger view truncated" in view


def test_an_unsupported_major_the_evidence_contains_verbatim_is_rebutted_and_does_not_count(d):
    out, art = run_critic(d, [{"id": "F1", "severity": "major", "kind": "unsupported", "passage": "Median latency fell from 120 ms to 85 ms after the change.",
                               "reason": "not in the ledger", "fix": "cut"}])
    assert out["majors"] == 0 and art["verdict"] == "pass" and art["rebutted"] == 1
    f = art["findings"][0]
    assert f["severity"] == "rebutted" and f["original_severity"] == "major" and "ledger c2" in f["rebuttal"]["pointer"] or "captured source" in f["rebuttal"]["pointer"]
    assert d.cli("status", "--json")[1]["overall"] != "NOT_READY"


def test_the_quoted_claim_span_is_matched_in_a_captured_source(d):
    out, art = run_critic(d, [{"id": "F1", "severity": "major", "kind": "unsupported", "passage": "A lab ran a latency test on 40 nodes in 2025 and published the numbers in its [test report](https://example.com/lab-report). Median latency fell from 120 ms to 85 ms after the change.",
                               "claim_span": "Median latency fell from 120 ms to 85 ms", "reason": "unsupported figure", "fix": "cut"}])
    assert out["majors"] == 0 and art["findings"][0]["rebuttal"]["pointer"].startswith(("ledger c2", "captured source sources/source-001.md"))
    out, art = run_critic(Driver(_other(d)), [{"id": "F1", "severity": "major", "kind": "unsupported", "passage": "The report covers one workload on one fleet.",
                                                          "claim_span": "the cache was the cause", "reason": "unsupported", "fix": "cut"}])  # a span not in the quoted text is ignored
    assert out["majors"] == 1


def test_a_genuinely_unsupported_major_stays_major(d):
    out, art = run_critic(d, [{"id": "F1", "severity": "major", "kind": "unsupported", "passage": "The report covers one workload on one fleet.", "reason": "unsupported", "fix": "cut"}])
    assert out["majors"] == 1 and art["findings"][0]["severity"] == "major" and "rebuttal" not in art["findings"][0]


def test_only_unsupported_findings_are_rebutted_not_style_majors(d):
    style = {"id": "F1", "severity": "major", "kind": "other", "passage": "Median latency fell from 120 ms to 85 ms after the change.", "reason": "corrective contrast device", "fix": "cut"}
    out, art = run_critic(d, [style])
    assert out["majors"] == 1 and art["findings"][0]["severity"] == "major"


def test_rebut_is_deterministic_and_leaves_short_spans_and_minors_alone():
    ev, srcs = {"claims": []}, [("s.md", "The lab ran 40 nodes. Latency fell.")]
    f = lambda **k: {"id": "F", "severity": "major", "verified": True, "passage": "x", "reason": "unsupported", "fix": "", **k}  # noqa: E731
    assert CE.rebut([f(passage="Latency")], ev, srcs)[0]["severity"] == "major"        # shorter than MIN_SPAN: would match anything
    assert CE.rebut([f(passage="The lab ran 40 nodes.")], ev, srcs)[0]["severity"] == "rebutted"
    assert CE.rebut([f(passage="The lab ran 40 nodes.", severity="minor")], ev, srcs)[0]["severity"] == "minor"
    assert CE.rebut([f(passage="The lab ran 40 nodes.", verified=False)], ev, srcs)[0]["severity"] == "major"
