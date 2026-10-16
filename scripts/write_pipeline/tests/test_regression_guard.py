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
    assert CT.REGRESSION_EPS == 0.0  # strict, no local tolerance: the normal fixture run must not regress body against body
    d.to_stage("fpverify")
    assert d.cli("run", "fpverify")[0] == 0
    r = d.cli("fpverify", "done")
    assert r[0] == 0, r
    assert d.cli("finalize")[0] == 0
    pipe = Pipeline(d.pkg)
    text = (d.pkg / "FINAL.md").read_text()
    assert "- Final vs draft: composite" in report.build_package_md(pipe, None, None, None, text=text)
    assert not any("worse than the draft" in x for x in verify.final_failures(pipe, d.runner))
    real = CT.signals  # verify recomputes from the bytes: make the final body (the only text that says "briefly") measure 5 worse than the draft body
    monkeypatch.setattr(CT, "signals", lambda t: {**real(t), "composite": real(t)["composite"] + (5.0 if "briefly" in t else 0.0)})
    assert any("worse than the draft" in x for x in verify.final_failures(pipe, d.runner))


# ---- like for like: body only on both sides, strict EPS 0, no mocked signals ---------------------------------------------
FRAME = ("# A title\n\n### A subtitle\n\n![Two bars](assets/hero.jpg)\n\n*Bars for the two medians.*\n\n> One fleet got quicker after a cache tweak, and its operators credit the tweak.\n\n"
         "*I build agents for a living, and one of them drafted this. The opinions and the edits are mine.*\n\n")


def test_body_only_strips_title_subtitle_hero_caption_tldr_disclosure_and_footer():
    from scripts.write_pipeline import furniture as FU
    body = FU.body_only(FRAME + CLEAN + FOOTER)
    assert body.strip() == CLEAN.strip()
    assert FU.body_only(CLEAN).strip() == CLEAN.strip()  # a body without frame is its own body


def test_a_normal_frame_around_the_same_body_is_not_a_regression():
    framed = FRAME + CLEAN + FOOTER
    r = fpv.regression_vs_draft(pipe_with(CLEAN), framed)
    assert r["regressed"] is False and r["delta"] == 0.0  # fail-before: the frame (TLDR, caption, footer) was measured against a body-only draft


def test_a_worse_body_is_flagged_even_inside_a_frame():
    r = fpv.regression_vs_draft(pipe_with(CLEAN), FRAME + WORSE + FOOTER)
    assert r["regressed"] is True


def _end_to_end(d, voice):
    """The whole fake run with the real strict contract (REGRESSION_EPS 0.0), nothing mocked: edit the voice text, walk to the end, finalize."""
    assert CT.REGRESSION_EPS == 0.0
    d.texts["voice"] = voice
    d.to_stage("fpverify")
    return d.cli("fpverify", "done"), d.cli("finalize")


def test_e2e_a_final_body_worse_than_the_draft_ends_not_ready_with_eps_zero(d):
    from .fakes import VOICE
    worse = VOICE.replace("Each node served", "But then, still, Each node served")  # more transitions, same facts, no template hit
    (rc, out), (frc, fout) = _end_to_end(d, worse)
    assert rc == 3 and out["code"] == "NOT_READY" and any("worse than the draft" in x for x in out["reasons"]), out
    assert frc != 0 and "NOT READY" in (d.pkg / "FINAL.md").read_text()


def test_e2e_an_equal_or_better_body_reaches_ready(d):
    from .fakes import VOICE
    (rc, out), (frc, fout) = _end_to_end(d, VOICE)
    assert rc == 0 and frc == 0 and "NOT READY" not in (d.pkg / "FINAL.md").read_text()
    from .test_failures import overall
    assert overall(d) == "READY_FOR_REVIEW"


def test_e2e_a_strictly_better_body_reaches_ready(d):
    from .fakes import VOICE
    from .test_failures import overall
    better = VOICE.replace("Each node served the same request mix before and after the change, and the team compared medians. ", "")  # fewer conjunctions per word
    assert CT.signals(better)["composite"] < CT.signals(VOICE)["composite"]
    (rc, out), (frc, fout) = _end_to_end(d, better)
    assert rc == 0 and frc == 0 and overall(d) == "READY_FOR_REVIEW"


def test_the_repair_no_regression_rule_compares_bodies_only():
    from scripts.write_pipeline import runs as RN
    cur = FRAME + CLEAN + FOOTER
    busy_tldr = cur.replace("One fleet got quicker after a cache tweak, and its operators credit the tweak.",
                            "But then, still, however, so it goes: one fleet got quicker, and its operators credit it, and so on.")
    assert RN.no_fingerprint_regression(cur, busy_tldr) == []  # frame wording is the frame's own restate check, not the body's regression
    assert RN.no_fingerprint_regression(cur, FRAME + WORSE + FOOTER)  # a worse body is rejected inside the same frame
    assert RN.no_fingerprint_regression(FRAME + WORSE + FOOTER, cur) == []
