"""One source of truth for the fingerprint caps, generation-time enforcement on submit, fingerprint debt, and NOT_READY packages at any stage."""
import json

from scripts.write_pipeline import antifp as AF
from scripts.write_pipeline import brief as BR
from scripts.write_pipeline import core
from scripts.write_pipeline import fpcaps as FC
from scripts.write_pipeline import report as RP

from .fakes import DRAFT, EDITORIAL, GENERIC, UNSLOP, VOICE

# exactly three template hits (three AI-vocabulary sentences): over the cap of 2, under the heavy threshold of 4
THREE = DRAFT.replace("The report describes the setup in plain terms.", "The report describes a robust setup.").replace(
    "The report covers one workload on one fleet.", "The report covers one seamless workload on one fleet.").replace(
    "The team has not published tail latency", "The team has not published pivotal tail latency")


FOUR = THREE.replace("A lab ran a latency test", "A lab ran a holistic latency test")


def art(d, stage="brief"):
    st = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    return json.loads((d.pkg / st["stages"][stage]["artifact"]).read_text())


def state(d):
    return json.loads((d.pkg / "write-pipeline/state.json").read_text())


def test_caps_come_from_antifp_thresholds_with_a_margin_and_author_data_never_loosens_them():
    c = FC.caps()
    assert c["template_hits"] <= AF.HEAVY_TEMPLATE_HITS - 2 and c["composite"] < AF.HEAVY_COMPOSITE and c["em_dash_per_1k"] == 0
    # every cap alone, and all caps together, stay below the composite the final gate rejects
    assert sum(AF.WEIGHTS[k] * v for k, v in c.items() if k != "composite") < AF.HEAVY_COMPOSITE
    assert FC.caps({"template_hits": 99, "repeated_ngram": 1.0}) == c  # looser author numbers change nothing
    assert FC.caps({"repeated_ngram": 0.001})["repeated_ngram"] == 0.001  # tighter ones do
    assert set(c) - {"composite"} <= set(AF.WEIGHTS)  # same metric names the antifp stage measures


def test_brief_carries_the_caps_in_antifp_units_and_a_ready_to_paste_prompt_block(d):
    d.to_stage("brief")
    assert d.cli("run", "brief")[0] == 0
    a = art(d)
    t = a["targets"]
    assert t["fingerprint_caps"] == FC.caps() and "rule_of_three_per_1k_max" not in t and "transitions_per_1k_max" not in t
    blk = a["generation_prompt_block"]
    assert 0 < len(blk.split()) <= BR.PROMPT_BLOCK_WORDS
    assert "template hits at most 2" in blk and "no em dashes" in blk and "This isn't a cache tweak, it's a shift." in blk and "Rule of three" in blk
    assert f"{t['sentence_words']['median']} words" in blk
    out = d.cli("run", "brief")[1]
    assert out["generation_prompt_block"] == blk and "paste generation_prompt_block verbatim" in out["then"]


def test_generic_draft_is_rejected_with_exact_passages_and_the_brief_then_debt_after_two(d):
    d.to_stage("draft")
    rc, out = d.submit("draft", GENERIC)
    assert rc == 1 and out["code"] == "FINGERPRINT" and out["rejections"] == "1 of 2"
    sentences = [h["sentence"] for h in out["offenders"]["template_hits"]]
    assert any("This isn't just a cache tweak, it's a paradigm shift." in s for s in sentences)
    assert any("Let's be honest" in s for s in sentences)
    assert out["offenders"]["transition_dense_paragraphs"] and out["offenders"]["repeated_ngrams"]
    assert "FINGERPRINT AND VOICE BRIEF" in out["brief"] and "HARD CAPS" in out["brief"]
    assert any("This isn't just a cache tweak" in r for r in out["reasons"])
    assert d.cli("status", "--json")[1]["overall"] != "NOT_READY"
    rc, out = d.submit("draft", GENERIC)
    assert rc == 1 and out["rejections"] == "2 of 2"
    rc, out = d.submit("draft", GENERIC)  # third: accepted, with the debt recorded
    assert rc == 0, out
    debt = state(d)["stages"]["draft"]["fingerprint_debt"]
    assert debt["stage"] == "draft" and {v["signal"] for v in debt["violations"]} >= {"template_hits", "composite"} and debt["rejections_used"] == 2


def test_each_stage_has_its_own_two_rejections_and_a_clean_text_clears_the_count(d):
    d.to_stage("draft")
    assert d.submit("draft", GENERIC)[1]["rejections"] == "1 of 2"
    assert d.submit("draft", DRAFT)[0] == 0 and "draft" not in state(d)["fingerprint_rejections"]
    assert d.submit("validate", DRAFT, report=d.FACTUAL)[0] == 0
    rc, out = d.submit("editorial", THREE, report=UNSLOP)  # a fresh counter for the next stage
    assert rc == 1 and out["code"] == "FINGERPRINT" and out["rejections"] == "1 of 2"
    assert [v["signal"] for v in out["violations"]] == ["template_hits"]
    assert len(out["offenders"]["template_hits"]) == 3


def test_the_claims_gate_stays_first_and_a_claims_failure_spends_no_fingerprint_rejection(d):
    d.to_stage("editorial")
    d.runner.forbidden = ["robust setup"]
    rc, out = d.submit("editorial", THREE, report=UNSLOP)
    assert rc == 1 and out.get("code") != "FINGERPRINT" and "changed meaning" in out["reasons"][0]
    assert state(d).get("fingerprint_rejections", {}).get("editorial", 0) == 0


def test_idempotent_resubmit_of_debt_text_is_not_remeasured(d):
    d.same_text(THREE).to_stage("editorial")  # draft is accepted as debt after two rejections
    assert state(d)["stages"]["draft"].get("fingerprint_debt")
    rc, out = d.submit("draft", THREE)
    assert rc == 0 and out["cached"] is True


def test_debt_must_be_cleared_by_antifp_and_uncleared_debt_ends_not_ready(d):
    d.same_text(THREE).to_stage("antifp")
    assert all(state(d)["stages"][s].get("fingerprint_debt") for s in ("draft", "editorial", "voice"))
    d.cli("antifp", "baseline")
    rc, out = d.cli("antifp", "finish")
    sig = AF.signals(THREE)
    assert sig["values"]["template_hits"] < AF.HEAVY_TEMPLATE_HITS and sig["composite"] < AF.HEAVY_COMPOSITE  # not heavy by the old rule
    assert rc == 3 and out["code"] == "NOT_READY" and out["report"]["fingerprint_debt"]["uncleared"]
    assert set(out["report"]["fingerprint_debt"]["stages"]) == {"draft", "editorial", "voice"}


def test_debt_cleared_by_antifp_finishes_clean(d):
    d.same_text(THREE).to_stage("antifp")
    d.cli("antifp", "baseline")
    cur = (d.pkg / "write-pipeline/antifp/current.md").read_text()
    fixed = cur.replace("The report describes a robust setup.", "The report describes the setup.")
    f = d.write("edit.md", fixed)
    assert d.cli("antifp", "try", "--file", str(f), "--signal", "template_hits")[1]["kept"] is True
    f = d.write("edit2.md", fixed.replace("seamless ", "").replace("pivotal ", ""))
    assert d.cli("antifp", "try", "--file", str(f), "--signal", "template_hits")[1]["kept"] is True
    rc, out = d.cli("antifp", "finish")
    assert rc == 0 and out["report"]["fingerprint_debt"]["uncleared"] == [] and set(out["report"]["fingerprint_debt"]["stages"]) == {"draft", "editorial", "voice"}


# ---- NOT_READY at any stage still produces the package ---------------------------------------------------------------
def assert_package(d, banner=True):
    fm, fh, pm = [(d.pkg / n).read_text() for n in ("FINAL.md", "FINAL.html", "PACKAGE.md")]
    assert "NOT READY" in fm and "NOT READY" in fh and "NOT_READY" in pm.split("## READY/NOT_READY")[1]
    heads = [ln[3:] for ln in pm.splitlines() if ln.startswith("## ")]
    assert heads == [RP.HEADINGS.get(k, k) for k in RP.SECTIONS]
    return fm, pm


def test_not_ready_at_the_angle_stage_writes_all_three_files_with_not_reached_sections(d):
    d.to_stage("angle")
    rc, out = d.submit("angle", dict(d.ANGLE, verdict="summary_only", contributions=[]))
    assert rc == 3 and out["code"] == "NOT_READY"
    fm, pm = assert_package(d)
    assert "not reached" in pm.split("## FINGERPRINT BASELINE")[1].split("##")[0] and "not reached" in pm.split("## MEDIUM REVIEW")[1].split("##")[0]


def test_antifp_not_ready_package_uses_the_best_kept_candidate_and_the_antifp_signals(d):
    d.same_text(FOUR).to_stage("antifp")
    d.cli("antifp", "baseline")
    cur = (d.pkg / "write-pipeline/antifp/current.md").read_text()
    f = d.write("edit.md", cur.replace("The report describes a robust setup.", "The report describes the setup."))
    assert d.cli("antifp", "try", "--file", str(f), "--signal", "template_hits")[1]["kept"] is True
    rc, out = d.cli("antifp", "finish")
    assert rc == 3 and 3 <= out['report']['after']['values']['template_hits'] < AF.HEAVY_TEMPLATE_HITS
    fm, pm = assert_package(d)
    assert "The report describes the setup." in fm and "robust setup" not in fm  # the kept edit, not the older voice artifact
    assert "antifp baseline" in pm and "the text of this package, measured now" in pm and "fingerprint debt accepted at draft" in pm
    assert "antifp attempts 1, kept 1" in pm and "over the generation cap: template_hits" in pm
    assert "fingerprint verification did not run; distance computed directly" in pm and "distance to the author corpus centroid" in pm and "baseline " in pm


def test_package_is_still_written_if_the_full_report_builder_raises(d, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("builder blew up")
    monkeypatch.setattr(RP, "build_package_md", boom)
    d.to_stage("angle")
    assert d.submit("angle", dict(d.ANGLE, verdict="summary_only", contributions=[]))[0] == 3
    fm, pm = assert_package(d)
    assert "builder blew up" in pm and "not reached or not available" in pm


def test_a_failing_html_render_does_not_cost_the_other_two_files(d, monkeypatch):
    from scripts.write_pipeline import frame
    monkeypatch.setattr(frame, "to_html", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("render failed")))
    d.to_stage("angle")
    assert d.submit("angle", dict(d.ANGLE, verdict="summary_only", contributions=[]))[0] == 3
    assert "NOT READY" in (d.pkg / "FINAL.md").read_text() and "NOT_READY" in (d.pkg / "PACKAGE.md").read_text()


def test_status_on_a_not_ready_run_restores_missing_package_files(d):
    d.to_stage("angle")
    d.submit("angle", dict(d.ANGLE, verdict="summary_only", contributions=[]))
    for n in ("FINAL.md", "FINAL.html", "PACKAGE.md"):
        (d.pkg / n).unlink()
    d.cli("status", "--json")
    assert_package(d)
