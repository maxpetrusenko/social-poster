"""Repair as one whole-article rewrite: once per run, full guard chain; and no repair mode may make the article more detectable."""
from scripts.write_pipeline import runs as RN

from .fakes import ANSWERED
from .test_critic_budget import MAJOR, state
from .test_repair_adds import TAIL, candidate, major_open, try_repair

REWORD = ("Anyone with a different request mix should rerun", "Any team with a different request mix should rerun")


def whole(d, text, **extra):
    return d.cli("repair", "try", "--file", str(d.write("repair.md", text)), "--report", str(d.write("repair.report.json", {"mode": "whole", **extra})))


def reword(d):
    return candidate(d).replace(*REWORD)


def test_whole_rewrite_is_accepted_once_and_recorded(d):
    major_open(d)
    rc, out = whole(d, reword(d))
    assert rc == 0 and out["code"] == "ACCEPTED" and out["mode"] == "whole", out
    assert state(d)["critic"]["whole_used"] is True


def test_second_whole_rewrite_in_the_run_is_refused_and_a_local_repair_still_works(d):
    major_open(d)
    assert whole(d, reword(d))[0] == 0
    d.critic.replies = [MAJOR]
    assert d.cli("run", "critic")[1]["majors"] >= 1  # the scoped round keeps the unresolved prior finding open
    rc, out = whole(d, candidate(d).replace("Any team", "Every team"))
    assert rc == 2 and out["code"] == "USAGE" and "once per run" in out["reasons"][0]
    rc, out = try_repair(d, candidate(d).replace("Any team", "Every team"))
    assert rc == 0 and out["mode"] == "local"


def test_unknown_mode_is_a_usage_error_and_does_not_spend_the_whole_rewrite(d):
    major_open(d)
    rc, out = d.cli("repair", "try", "--file", str(d.write("repair.md", reword(d))), "--report", str(d.write("r.json", {"mode": "everything"})))
    assert rc == 2 and "mode must be one of" in out["reasons"][0] and not state(d)["critic"].get("whole_used")


def test_whole_mode_keeps_the_guard_chain_numbers_links_and_claims(d):
    major_open(d)
    rc, out = whole(d, candidate(d).replace("from 120 ms to 85 ms", "from 120 ms to 80 ms"))
    assert rc == 1 and any("number" in r for r in out["reasons"]), out
    assert state(d)["critic"]["whole_used"] is True  # attempted: spent even though it was rejected


def test_whole_mode_still_hits_the_claims_gate(d):
    major_open(d)
    d.runner.forbidden = ["Any team with"]
    rc, out = whole(d, reword(d))
    assert rc == 1 and any("claims gate failed" in r for r in out["reasons"])


def test_whole_mode_still_runs_the_experience_trace(d):
    d.human = dict(ANSWERED)
    major_open(d)
    rc, out = whole(d, candidate(d).replace(TAIL, TAIL + " I've seen versions of this problem in software."))
    assert rc == 1 and any("experience trace" in r for r in out["reasons"]), out


def test_a_repair_that_raises_the_fingerprint_composite_is_rejected_in_every_mode(d, monkeypatch):
    from scripts.write_pipeline import fpcontract
    monkeypatch.setattr(fpcontract, "REGRESSION_EPS", 0.0)  # conftest relaxes it for ~120 word fixtures; production is strict
    major_open(d)
    worse = candidate(d).replace(TAIL, TAIL + " This isn't a benchmark, it's a shift. Not speed, but trust.")
    for run in (lambda: try_repair(d, worse), lambda: whole(d, worse)):
        rc, out = run()
        assert rc == 1 and any(r.startswith("fingerprint composite rose") for r in out["reasons"]), out


def test_a_repair_that_adds_advisory_patterns_is_rejected(d):
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(TAIL, TAIL + " It's tempting to say the cache alone explains the drop."))
    assert rc == 1 and any(r.startswith("advisory pattern total rose") and "tempting_frame" in r for r in out["reasons"]), out


def test_no_regression_helper_accepts_equal_and_better(monkeypatch):
    from scripts.write_pipeline import fpcontract
    monkeypatch.setattr(fpcontract, "REGRESSION_EPS", 0.0)
    a = "# T\n\nThe lab ran the test on 40 nodes. Latency fell.\n"
    assert RN.no_fingerprint_regression(a, a) == []
    worse = a + "\nIt's tempting to say the cache explains it.\n"
    assert RN.no_fingerprint_regression(a, worse) and RN.no_fingerprint_regression(worse, a) == []
