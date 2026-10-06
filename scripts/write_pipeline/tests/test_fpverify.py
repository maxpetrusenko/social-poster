"""Stage `fpverify`: baseline vs final fingerprint, at most two targeted repair rounds, each gated; reported in PACKAGE.md."""
import json

from scripts.write_pipeline import authorprofile as PF

from .fakes import DRAFT
from .test_failures import ONE_HIT, stages
from .test_critic_budget import state

HERE = "The team has not published tail latency, so the median alone cannot say whether the slowest requests improved."
TWO_HIT = ONE_HIT.replace(HERE, "Here's the thing: the team has not published tail latency, so the median alone cannot say whether the slowest requests improved.")
FIX_A = "The test covers one workload on one fleet."
ONE = "This isn't a benchmark. It's a single test on one fleet."
THING = "Here's the thing: the team has not"


def fpv(d, *args):
    return d.cli("fpverify", *args)


def try_edit(d, text, signal="template_hits"):
    return fpv(d, "try", "--file", str(d.write("fp.md", text)), "--signal", signal)


def at_fpverify(d, text):
    d.same_text(text).to_stage("fpverify")
    d.cli("run", "fpverify")  # measures and writes current.md: the framed candidate every edit must start from
    return d


def cur(d) -> str:
    return (d.pkg / "write-pipeline/fpverify/current.md").read_text()


def test_clean_text_completes_with_baseline_and_final_measured(d):
    d.to_stage("fpverify")
    assert d.cli("run", "fpverify")[0] == 0
    assert fpv(d, "done")[0] == 0
    rep_rel = state(d)["stages"]["fpverify"]["report"]
    rep = json.loads((d.pkg / rep_rel).read_text())
    assert set(PF.SIGNALS) <= {r["signal"] for r in rep["baseline"]["signals"]} and set(PF.SIGNALS) <= {r["signal"] for r in rep["final"]["signals"]}
    assert rep["baseline"]["sha256"] != "" and "no third-party AI detector" in rep["policy"]
    assert {"sentence_regularity", "paragraph_regularity", "structural_repetition", "ngram_repetition", "rhetorical_repetition", "burstiness", "author_distance"} <= set(PF.SIGNALS)
    assert rep["author_voice"]["baseline_distance"] > 0 and rep["changes"]["rounds_max"] == 2


def test_significant_signal_allows_two_gated_rounds_and_a_clean_result_finishes(d):
    at_fpverify(d, TWO_HIT)
    rc, out = d.cli("run", "fpverify")
    assert rc == 0 and out["done"] is False and "template_hits" in [r["signal"] for r in out["strongest_remaining"]] and out["rounds_left"] == 2
    gates = d.runner.n("scripts.write_pipeline.gaterun")
    rc, out = try_edit(d, cur(d).replace(ONE, FIX_A))
    assert rc == 0 and out["kept"] is True and out["claims_gate"] == "PASS" and d.runner.n("scripts.write_pipeline.gaterun") == gates + 1  # re-measured, then gated
    assert d.runner.notes_seen  # the gate saw the source notes and the ledger
    rc, out = try_edit(d, cur(d).replace(THING, "The team has not"))  # fixes the second hit but worsens other signals on this tiny text: rejected per edit
    assert rc == 1 and out["kept"] is False and any("overall fingerprint worse" in r for r in out["reasons"]) and out["rounds_left"] == 0
    rc, out = d.cli("run", "fpverify")  # no round left: the stage records the result and the remaining signals
    assert rc == 0 and out["done"] is True and out["remaining_significant"] >= 1
    final = (d.pkg / state(d)["stages"]["fpverify"]["artifact"]).read_text()
    assert FIX_A in final and THING in final
    rep = json.loads((d.pkg / state(d)["stages"]["fpverify"]["report"]).read_text())
    assert rep["changes"]["kept"] == 1 and len(rep["changes"]["attempts"]) == 2
    assert rep["baseline"]["values"]["template_hits"] == 2 and rep["final"]["values"]["template_hits"] == 1
    assert d.cli("finalize")[0] == 0 and (d.pkg / "FINAL.md").read_text() == final  # the integrity gate sees the fingerprint-verified bytes


def test_edit_that_loses_a_link_or_changes_a_claim_is_rejected_and_costs_a_round(d):
    at_fpverify(d, TWO_HIT)
    lost = cur(d).replace(ONE, FIX_A).replace("[test report](https://example.com/lab-report)", "test report")
    rc, out = try_edit(d, lost)
    assert rc == 1 and out["kept"] is False and any("link" in r for r in out["reasons"])
    d.runner.forbidden = ["attribute the drop to the network"]
    rc, out = try_edit(d, cur(d).replace(ONE, FIX_A).replace("attribute the drop to the cache", "attribute the drop to the network"))
    assert rc == 1 and out["kept"] is False and out["rounds_left"] == 0
    rc, out = try_edit(d, cur(d).replace(ONE, FIX_A))  # the third try is refused: two rounds per run
    assert rc == 1 and "fingerprint repair rounds" in out["reasons"][0]
    assert fpv(d, "done")[0] == 0 and stages(d)["fpverify"] == "DONE"
    rep = json.loads((d.pkg / state(d)["stages"]["fpverify"]["report"]).read_text())
    assert rep["remaining_significant"] >= 1 and "template_hits" in [r["signal"] for r in rep["strongest_remaining"]]  # remaining signals are reported, not hidden


def test_edit_that_does_not_improve_the_target_or_is_not_local_is_rejected(d):
    at_fpverify(d, TWO_HIT)
    rc, out = try_edit(d, cur(d).replace("The report describes", "The report states"))
    assert rc == 1 and any("did not improve" in r for r in out["reasons"])
    rc, out = fpv(d, "try", "--file", str(d.write("same.md", cur(d))), "--signal", "template_hits")
    assert rc == 1 and "identical" in out["reasons"][0]
    rc, out = fpv(d, "try", "--file", str(d.write("x.md", cur(d))), "--signal", "nope")
    assert rc == 1 and "must be one of" in out["reasons"][0]


def test_gateway_error_during_a_round_blocks_without_burning_it(d):
    at_fpverify(d, TWO_HIT)
    d.runner.gate = "ERROR"
    rc, out = try_edit(d, cur(d).replace(ONE, FIX_A))
    assert rc == 4 and out["code"] == "BLOCKED" and state(d)["fpverify"]["rounds"] == 0
    d.runner.gate = "PASS"
    assert try_edit(d, cur(d).replace(ONE, FIX_A))[0] == 0


def test_package_reports_baseline_final_changes_and_remaining(d):
    at_fpverify(d, TWO_HIT)
    assert try_edit(d, cur(d).replace(ONE, FIX_A))[0] == 0
    assert fpv(d, "done")[0] == 0 and d.cli("finalize")[0] == 0
    pm = (d.pkg / "PACKAGE.md").read_text()
    for h in ("## FINGERPRINT BASELINE", "## FINGERPRINT FINAL", "## FINGERPRINT CHANGES", "## REMAINING FINGERPRINT SIGNALS", "## AUTHOR-VOICE RESULT (metric)"):
        assert h in pm
    assert "template_hits: 2.0" in pm.split("## FINGERPRINT FINAL")[0] and "round 1 target template_hits: kept" in pm
    assert "strongest in the baseline" in pm and "strongest remaining in the final" in pm


def test_user_edit_after_pass_is_remeasured_against_the_baseline_draft(d):
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    assert d.cli("revalidate")[0] == 0
    rep = json.loads((d.pkg / state(d)["stages"]["fpverify"]["report"]).read_text())
    assert rep["final"]["sha256"] != rep["baseline"]["sha256"] and stages(d)["fpverify"] == "DONE"
