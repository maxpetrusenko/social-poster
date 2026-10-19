"""WRITE_PIPELINE_FINGERPRINT: one switch for fingerprint GATING. Default off (measure and report only); "on" restores enforcement."""
import pytest

from scripts.write_pipeline import fpcontract as CT
from scripts.write_pipeline import fpv, report, verify
from scripts.write_pipeline.core import Pipeline

from .fakes import VOICE
from .test_fp_enforce import FOUR
from .test_regression_guard import CLEAN, WORSE, _end_to_end, pipe_with

ENV = "WRITE_PIPELINE_FINGERPRINT"


def test_default_unset_is_off(monkeypatch):
    monkeypatch.delenv(ENV, raising=False)
    assert CT.gate_enabled() is False


@pytest.mark.parametrize("val,exp", [("on", True), ("ON", True), (" on ", True), ("off", False), ("", False), ("1", False)])
def test_value_is_read_on_every_call(monkeypatch, val, exp):
    monkeypatch.setenv(ENV, val)
    assert CT.gate_enabled() is exp


def _heavy_antifp(d):
    d.same_text(FOUR).to_stage("antifp")  # reaching antifp with the generation caps still applies; the gate switch is flipped after
    d.cli("antifp", "baseline")


def test_on_heavy_antifp_text_is_not_ready(d):
    _heavy_antifp(d)
    rc, out = d.cli("antifp", "finish")
    assert rc == 3 and out["code"] == "NOT_READY"


def test_off_heavy_antifp_text_finishes_done_with_measured_values(d, monkeypatch):
    _heavy_antifp(d)
    monkeypatch.setenv(ENV, "off")
    rc, out = d.cli("antifp", "finish")
    assert rc == 0, out
    rep = out["report"]
    assert rep["gate"] == "off" and rep["fingerprint_heavy"] is False and rep["after"]["values"]["template_hits"] >= CT.HEAVY_TEMPLATE_HITS


def test_on_report_has_no_gate_key(d):
    _heavy_antifp(d)
    rc, out = d.cli("antifp", "finish")
    assert "gate" not in out["report"]


def test_off_fpverify_finishes_with_a_regressed_final(d, monkeypatch):
    monkeypatch.setenv(ENV, "off")
    worse = VOICE.replace("Each node served", "But then, still, Each node served")
    (rc, out), _ = _end_to_end(d, worse)
    assert rc == 0 and out.get("code") != "NOT_READY", out
    rep = Pipeline(d.pkg).read_json("fpverify", "report")
    assert rep["gate"] == "off" and rep["regression"]["regressed"] is True


def test_off_run_fpverify_skips_the_repair_loop(d, monkeypatch):
    monkeypatch.setenv(ENV, "off")
    d.texts["voice"] = VOICE.replace("Each node served", "But then, still, Each node served")
    d.to_stage("fpverify")
    rc, out = d.cli("run", "fpverify")
    assert out.get("done") is True and out.get("code") != "NOT_READY"


def test_off_contract_bad_is_empty_and_on_is_unchanged(monkeypatch):
    rep = {"contract": {"heavy": True, "composite": 99.0, "owed": [{"signal": "x", "value": 1, "cap": 0}]}, "regression": {"draft": 1.0, "final": 2.5, "delta": 1.5, "regressed": True}}
    monkeypatch.setenv(ENV, "off")
    assert fpv._contract_bad(rep) == []
    monkeypatch.setenv(ENV, "on")
    assert len(fpv._contract_bad(rep)) == 3


def test_final_failures_regression_entry_only_when_on(d, monkeypatch):
    d.to_stage("fpverify")
    assert d.cli("run", "fpverify")[0] == 0 and d.cli("fpverify", "done")[0] == 0 and d.cli("finalize")[0] == 0
    pipe = Pipeline(d.pkg)
    real = CT.signals
    monkeypatch.setattr(CT, "signals", lambda t: {**real(t), "composite": real(t)["composite"] + (5.0 if "briefly" in t else 0.0)})
    monkeypatch.setenv(ENV, "on")
    assert any("worse than the draft" in x for x in verify.final_failures(pipe, d.runner))
    monkeypatch.setenv(ENV, "off")
    assert not any("worse than the draft" in x for x in verify.final_failures(pipe, d.runner))


def test_package_md_states_the_gate_only_when_off(d, monkeypatch):
    d.to_stage("fpverify")
    assert d.cli("run", "fpverify")[0] == 0 and d.cli("fpverify", "done")[0] == 0 and d.cli("finalize")[0] == 0
    pipe = Pipeline(d.pkg)
    text = (d.pkg / "FINAL.md").read_text()
    line = "Fingerprint gate: off (WRITE_PIPELINE_FINGERPRINT); signals reported, not enforced"
    monkeypatch.setenv(ENV, "off")
    assert report.build_package_md(pipe, None, None, None, text=text).count(line) == 1
    monkeypatch.setenv(ENV, "on")
    assert line not in report.build_package_md(pipe, None, None, None, text=text)


def test_off_generic_draft_is_not_rejected_at_submit(d, monkeypatch):
    import json
    from .fakes import GENERIC
    monkeypatch.setenv(CT.ENV_GATE, "off")
    d.to_stage("draft")
    rc, out = d.submit("draft", GENERIC)
    st = json.loads((d.pkg / "write-pipeline" / "state.json").read_text())
    assert out.get("code") != "FINGERPRINT" and "fingerprint_debt" not in st["stages"]["draft"] and not st.get("fingerprint_rejections")
