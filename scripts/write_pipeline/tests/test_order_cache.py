"""Stage order, hash-bound cache skip, and invalidation of downstream stages."""
import json

from scripts.write_pipeline.core import NAMES

from .fakes import DRAFT, Driver


def stages(d):
    return {r["stage"]: r["state"] for r in d.cli("status", "--json")[1]["stages"]}


def test_stage_table_is_the_specified_order():
    assert NAMES == ["source", "research", "angle", "outline", "brief", "draft", "validate", "editorial", "voice", "antifp", "review", "title",
                     "images", "critic", "repair", "fpverify", "integrity", "hash", "package", "stop"]


def test_cannot_submit_a_stage_before_its_inputs(d):
    d.cli("init")
    rc, out = d.submit("draft", DRAFT)
    assert rc == 2 and out["code"] == "WAITING" and "research" in out["reasons"][0] or "outline" in out["reasons"][0]
    rc, out = d.cli("begin", "outline")
    assert rc == 2 and out["action"] == "wait"


def test_stages_complete_in_order_and_the_log_proves_it(d):
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    done = [json.loads(ln) for ln in (d.pkg / "write-pipeline" / "log.jsonl").read_text().splitlines()]
    seq = [e["stage"] for e in done if e["event"] == "stage" and e["status"] == "DONE"]
    assert seq == NAMES


def test_unchanged_stage_is_skipped_from_cache(d):
    d.to_stage("outline")
    rc, out = d.cli("begin", "source")
    assert out["action"] == "skip" and "cached" in out["reason"]
    before = d.cli("status", "--json")[1]
    rc, out = d.submit("source", d.sources())  # same bytes, same inputs
    assert rc == 0 and out["cached"] is True
    assert d.cli("status", "--json")[1]["stages"] == before["stages"]  # nothing downstream was invalidated
    assert stages(d)["research"] == "DONE"


def test_changed_input_invalidates_only_the_downstream_chain(d):
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    ang = dict(d.ANGLE, angle="a narrower angle on what the report supports")
    rc, out = d.submit("angle", ang)
    assert rc == 0 and out["cached"] is False
    s = stages(d)
    assert s["source"] == s["research"] == s["angle"] == "DONE"
    assert all(s[n] == "STALE" for n in NAMES[3:])  # outline onward is bound to the old angle hash
    rc, out = d.cli("begin", "outline")
    assert out["action"] == "run" and out["previous_state"] == "STALE"


def test_a_stale_stage_that_is_resubmitted_unchanged_revives_its_chain(d):
    d.to_stage("critic")
    d.submit("angle", dict(d.ANGLE, angle="temporary"))
    d.submit("angle", d.ANGLE)  # back to the original bytes: every downstream bundle matches again
    assert stages(d)["images"] == "DONE" and stages(d)["voice"] == "DONE"


def test_framework_change_invalidates_everything(d):
    d.to_stage("draft")
    d.fw.write_text("# framework v6 (edited)\n")
    s = stages(d)
    assert s["source"] == "STALE" and s["outline"] == "STALE"
    rc, out = d.cli("begin", "source")
    assert out["action"] == "run"


def test_missing_framework_blocks_with_BLOCKED_FRAMEWORK(d):
    d.to_stage("outline")
    d.fw.unlink()
    rc, out = d.cli("status", "--json")
    assert rc == 4 and out["state"] == "BLOCKED_FRAMEWORK"
    (d.tmp / "other").mkdir()
    d2 = Driver(d.tmp / "other")
    d2.fw.unlink()
    rc, out = d2.cli("init")
    assert rc == 4 and out["state"] == "BLOCKED_FRAMEWORK"


def test_unchanged_review_and_critic_are_cache_hits(d):
    d.to_stage("repair")
    r_calls, c_calls = d.runner.n("scripts.medium_review"), len(d.critic.prompts)
    assert d.cli("run", "review")[1]["cached"] is True
    assert d.cli("run", "critic")[1]["cached"] is True
    assert d.runner.n("scripts.medium_review") == r_calls and len(d.critic.prompts) == c_calls


def test_resubmitting_done_text_stages_is_a_cached_noop_that_never_runs_the_gate(d):
    from scripts.write_pipeline import submit as S
    d.to_stage("antifp")
    before = d.cli("status", "--json")[1]
    pipe_state = (d.pkg / "write-pipeline" / "state.json").read_bytes()
    boom = lambda *a, **k: (_ for _ in ()).throw(AssertionError("gate re-ran on a cached resubmit"))
    mp = __import__("pytest").MonkeyPatch()
    try:
        for name in ("claims_gate", "edit_guard", "confirm_link_removals"):
            mp.setattr(S.G, name, boom)
        mp.setattr(S, "_fingerprint_gate", boom)
        mp.setattr(S.V, "text_basic", boom)
        for stage, rep in (("draft", None), ("validate", d.FACTUAL), ("editorial", __import__("scripts.write_pipeline.tests.fakes", fromlist=["UNSLOP"]).UNSLOP),
                           ("voice", __import__("scripts.write_pipeline.tests.fakes", fromlist=["UNSLOP"]).UNSLOP)):
            rc, out = d.submit(stage, d.texts[stage], report=rep)
            assert rc == 0 and out["cached"] is True, (stage, out)
    finally:
        mp.undo()
    assert d.cli("status", "--json")[1]["stages"] == before["stages"]
    assert all(s == "DONE" for n, s in stages(d).items() if n in ("draft", "validate", "editorial", "voice"))
    assert (d.pkg / "write-pipeline" / "state.json").read_bytes() == pipe_state
