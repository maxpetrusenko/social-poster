"""Never ship worse than the draft: the final composite (footer excluded, TLDR kept) may not exceed the draft composite. Strict, no tolerance."""
from types import SimpleNamespace

from scripts.write_pipeline import fpcontract as CT
from scripts.write_pipeline import fpv

CLEAN = "The team measured median latency on one fleet. The result held for one workload.\n\nThe report is public and the numbers are in it.\n"
WORSE = ("Here's the thing: it isn't just latency. It's a different story. In today's world, it's worth noting that the real story is the fleet. "
         "Here's the thing: it isn't just the cache. It's a different story.\n\nThe report is public and the numbers are in it.\n")
FOOTER = "\n---\n\nRead next: [Another piece](https://medium.com/@x/another-1)\n\n---\n\nI am an author with a Medium profile https://medium.com/@max\n"


def pipe_with(draft):
    return SimpleNamespace(read_art=lambda stage: draft if stage == "draft" else None)


def test_strict_eps_is_a_named_zero():
    assert CT.REGRESSION_EPS == 0.0


def test_worse_than_draft_is_flagged_with_numbers():
    r = fpv.regression_vs_draft(pipe_with(CLEAN), WORSE)
    assert r["regressed"] is True and r["final"] > r["draft"] and r["delta"] == round(r["final"] - r["draft"], 4)


def test_equal_to_draft_passes():
    r = fpv.regression_vs_draft(pipe_with(CLEAN), CLEAN)
    assert r["regressed"] is False and r["delta"] == 0.0


def test_better_than_draft_passes():
    r = fpv.regression_vs_draft(pipe_with(WORSE), CLEAN)
    assert r["regressed"] is False and r["delta"] < 0


def test_footer_is_excluded_from_the_final_measure():
    plain = fpv.regression_vs_draft(pipe_with(CLEAN), CLEAN)
    with_footer = fpv.regression_vs_draft(pipe_with(CLEAN), CLEAN + FOOTER)
    assert with_footer["final"] == plain["final"] and with_footer["regressed"] is False


def test_contract_bad_names_the_regression_so_a_round_is_spent_and_finish_refuses():
    rep = {"contract": {"heavy": False, "composite": 1.0, "owed": []}, "regression": {"draft": 1.0, "final": 2.5, "delta": 1.5, "regressed": True}}
    assert any("worse than the draft" in x for x in fpv._contract_bad(rep))
    rep["regression"]["regressed"] = False
    assert fpv._contract_bad(rep) == []


def test_no_draft_means_no_regression_claim():
    assert fpv.regression_vs_draft(pipe_with(None), WORSE) is None


def test_package_report_has_a_final_vs_draft_line_and_verify_recomputes_it(d, monkeypatch):
    from scripts.write_pipeline import report, verify
    from scripts.write_pipeline.core import Pipeline
    monkeypatch.setattr(CT, "REGRESSION_EPS", 1000.0)  # the fixture frame is not the subject here; the strict zero is pinned above
    d.to_stage("fpverify")
    assert d.cli("run", "fpverify")[0] == 0
    r = d.cli("fpverify", "done")
    assert r[0] == 0, r
    assert d.cli("finalize")[0] == 0
    pipe = Pipeline(d.pkg)
    text = (d.pkg / "FINAL.md").read_text()
    assert "- Final vs draft: composite" in report.build_package_md(pipe, None, None, None, text=text)
    assert not any("worse than the draft" in x for x in verify.final_failures(pipe, d.runner))
    monkeypatch.setattr(CT, "REGRESSION_EPS", 0.0)
    real = CT.signals
    monkeypatch.setattr(CT, "signals", lambda t: {**real(t), "composite": real(t)["composite"] + (5.0 if "Read next" not in t and "---" not in t else 0.0)} if t.lstrip().startswith("#") else real(t))
    assert any("worse than the draft" in x for x in verify.final_failures(pipe, d.runner))
