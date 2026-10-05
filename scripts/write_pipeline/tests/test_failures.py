"""Failure scenarios with stub models. Each must end in the right state, and none may publish."""
import json

import pytest


from .fakes import DRAFT, EDITORIAL, GENERIC, UNSLOP, VOICE, URL, sha, unavailable

ONE_HIT = DRAFT.replace("The report covers one workload on one fleet.", "This isn't a benchmark. It's a single test on one fleet.")
FIX = "The test covers one workload on one fleet."
SHORT = DRAFT + "\n## Status\n\nThe API is deprecated.\n"


def stages(d):
    return {r["stage"]: r["state"] for r in d.cli("status", "--json")[1]["stages"]}


def overall(d):
    return d.cli("status", "--json")[1]["overall"]


def no_publish(d):
    s = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    assert s["published"] is False and not s.get("awaiting_review")
    assert {m for m, _ in d.runner.calls} <= {"scripts.fingerprint_eval.run", "scripts.fingerprint_eval.release", "scripts.medium_review", "scripts.publish_route"}
    assert all(argv[3] == "decide" for m, argv in d.runner.calls if m == "scripts.publish_route")


def antifp_edit(d, text, signal="template_hits"):
    f = d.write("edit.md", text)
    return d.cli("antifp", "try", "--file", str(f), "--signal", signal)


def current(d):
    return (d.pkg / "write-pipeline/antifp/current.md").read_text()


# ---- fingerprint-heavy generic draft ---------------------------------------------------------------------------
def test_fingerprint_heavy_generic_draft_ends_not_ready(d):
    d.same_text(GENERIC).to_stage("antifp")
    rc, out = d.cli("antifp", "baseline")
    assert out["strongest"][0]["signal"] == "template_hits" and out["strongest"][0]["where"]
    rc, out = d.cli("antifp", "finish")
    assert rc == 3 and out["code"] == "NOT_READY" and out["report"]["fingerprint_heavy"] is True
    assert overall(d) == "NOT_READY" and stages(d)["antifp"] == "NOT_READY"
    assert d.cli("run", "review")[0] == 2 and d.cli("finalize")[0] == 2
    assert not (d.pkg / "FINAL.md").exists() and d.runner.n("scripts.fingerprint_eval.release") == 0
    no_publish(d)


def test_reworking_the_draft_upstream_clears_the_not_ready_state(d):
    d.same_text(GENERIC).to_stage("antifp")
    d.cli("antifp", "baseline")
    d.cli("antifp", "finish")
    assert overall(d) == "NOT_READY"
    assert d.submit("voice", VOICE, report=UNSLOP)[0] == 0  # new bytes: the verdict no longer applies
    assert overall(d) == "IN_PROGRESS"
    d.cli("antifp", "baseline")
    assert d.cli("antifp", "finish")[0] == 0


# ---- the targeted loop: keep only if positive AND the claims/links gate holds ------------------------------------
def test_edit_kept_only_when_signal_improves_and_gates_hold(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    gate_calls = d.runner.n("scripts.fingerprint_eval.run")
    rc, out = antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX))
    assert rc == 0 and out["kept"] is True and out["composite"][1] < out["composite"][0]
    assert d.runner.n("scripts.fingerprint_eval.run") == gate_calls + 1
    assert FIX in current(d)


def test_edit_that_does_not_improve_is_rejected_without_spending_a_model_call(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    before, calls = current(d), d.runner.n("scripts.fingerprint_eval.run")
    rc, out = antifp_edit(d, ONE_HIT.replace("the same request mix", "an identical request mix"))
    assert rc == 1 and out["kept"] is False and "did not improve" in out["reasons"][0]
    assert d.runner.n("scripts.fingerprint_eval.run") == calls and current(d) == before


def test_non_local_edit_is_rejected(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    big = ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX).replace("The report describes the setup in plain terms.", "The setup is described plainly.")
    big = big.replace("published the numbers in", "reported the numbers in") + "\nA closing note on scope.\n"
    rc, out = antifp_edit(d, big)
    assert rc == 1 and "not local" in out["reasons"][0]


def test_claims_gate_failure_rejects_an_improving_edit(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    d.runner.forbidden = ["to the network"]  # the stub claim judge sees a changed claim
    before = current(d)
    rc, out = antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX).replace("to the cache", "to the network"))
    assert rc == 1 and out["kept"] is False and out["claims_gate"] == "FAIL" and current(d) == before


def test_deleted_factual_sentence_is_rejected_by_the_claims_gate(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    d.runner.required = ["The team has not published tail latency"]
    cand = ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX).replace(
        " The team has not published tail latency, so the median alone cannot say whether the slowest requests improved.", "")
    rc, out = antifp_edit(d, cand)
    assert rc == 1 and out["claims_gate"] == "FAIL" and out["kept"] is False


def test_deleted_sentence_with_a_number_is_rejected_before_any_model_call(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    calls = d.runner.n("scripts.fingerprint_eval.run")
    cand = ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX).replace(" Median latency fell from 120 ms to 85 ms after the change.", "")
    rc, out = antifp_edit(d, cand)
    assert rc == 1 and any("number lost" in r for r in out["reasons"]) and d.runner.n("scripts.fingerprint_eval.run") == calls


def test_factual_mutation_of_a_number_is_rejected(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    rc, out = antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX).replace("40 nodes", "41 nodes"))
    assert rc == 1 and "CONTENT_CLAIM_FAILURE" in out["guard_categories"] and "ADDED_UNSUPPORTED_CLAIM" in out["guard_categories"]


def test_short_changed_claim_is_rejected_by_the_frozen_block_check(d):
    d.same_text(SHORT.replace("The report covers one workload on one fleet.", "This isn't a benchmark. It's a single test on one fleet.")).to_stage("antifp")
    d.cli("antifp", "baseline")
    cand = current(d).replace("The API is deprecated.", "The API is supported.").replace("This isn't a benchmark. It's a single test on one fleet.", FIX)
    rc, out = antifp_edit(d, cand)
    assert rc == 1 and any("frozen block" in r for r in out["reasons"])


def test_missing_link_edit_is_rejected(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    cand = ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX).replace("[test report](https://example.com/lab-report)", "test report")
    rc, out = antifp_edit(d, cand)
    assert rc == 1 and "MISSING_LINK" in out["guard_categories"]


def test_invented_experience_edit_is_rejected(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    rc, out = antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", "I tested it on my own fleet and saw the same drop."))
    assert rc == 1 and any("experience" in r for r in out["reasons"])


def test_gate_error_during_the_loop_blocks_and_keeps_nothing(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    d.runner.gate = "ERROR"
    before = current(d)
    rc, out = antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX))
    assert rc == 4 and out["code"] == "BLOCKED" and current(d) == before and overall(d) == "BLOCKED"
    d.runner.gate = "PASS"
    assert antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX))[0] == 0  # retry once the evaluator is back


def test_kept_edit_flows_to_the_final_bytes_and_the_reference_stays_pre_antifp(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    assert antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX))[0] == 0
    assert d.cli("antifp", "finish")[0] == 0
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    final = (d.pkg / "FINAL.md").read_text()
    ref = (d.pkg / "write-pipeline/frame/reference-frame.md").read_text()
    assert FIX in final and "This isn't a benchmark" in ref and "This isn't a benchmark" not in final
    assert d.runner.authorize_seen[-1] == sha(final)
    rep = json.loads((d.pkg / "write-pipeline/artifacts/09-antifp.report.json").read_text())
    assert rep["kept"] == 1 and "no third-party AI detector" in rep["policy"]


# ---- upstream factual mutation, deletion, links, sources -------------------------------------------------------------
def test_factual_mutation_in_the_voice_pass_is_rejected(d):
    d.to_stage("voice")
    d.runner.forbidden = ["to the network"]
    rc, out = d.submit("voice", VOICE.replace("to the cache", "to the network"), report=UNSLOP)
    assert rc == 1 and "changed meaning" in out["reasons"][0] and stages(d)["voice"] == "FAILED" and stages(d)["antifp"] == "WAITING"
    no_publish(d)


def test_factual_mutation_in_the_editorial_pass_is_rejected(d):
    d.to_stage("editorial")
    d.runner.forbidden = ["to the network"]
    rc, out = d.submit("editorial", EDITORIAL.replace("to the cache", "to the network"), report=UNSLOP)
    assert rc == 1 and "changed meaning" in out["reasons"][0]


def test_mutated_number_in_editorial_is_rejected(d):
    d.to_stage("editorial")
    rc, out = d.submit("editorial", EDITORIAL.replace("40 nodes", "41 nodes"), report=UNSLOP)
    assert rc == 1 and any("number lost" in r for r in out["reasons"]) and any("not found in the sources" in r for r in out["reasons"])


def test_deleted_numeric_sentence_needs_a_declared_removal(d):
    d.to_stage("editorial")
    cut = EDITORIAL.replace(" Median latency fell from 120 ms to 85 ms after the change.", "")
    rc, out = d.submit("editorial", cut, report=UNSLOP)
    assert rc == 1 and any("number lost" in r for r in out["reasons"])
    declared = dict(UNSLOP, removals=[{"text": "Median latency fell from 120 ms to 85 ms after the change.", "reason": "restated lower down"}])
    assert d.submit("editorial", cut, report=declared)[0] == 0  # a deletion pass is allowed when it is declared


def test_missing_link_in_editorial_is_rejected(d):
    d.to_stage("editorial")
    rc, out = d.submit("editorial", EDITORIAL.replace("[test report](https://example.com/lab-report)", "test report"), report=UNSLOP)
    assert rc == 1 and "link removed" in out["reasons"][0]


def test_draft_link_outside_the_evidence_set_is_a_missing_source(d):
    d.to_stage("draft")
    rc, out = d.submit("draft", DRAFT.replace(URL, "https://made-up.example.org/study"))
    assert rc == 1 and any("missing source" in r for r in out["reasons"])


def test_draft_number_not_in_any_source_is_rejected(d):
    d.to_stage("draft")
    rc, out = d.submit("draft", DRAFT.replace("40 nodes", "400 nodes"))
    assert rc == 1 and any("not found in the sources" in r for r in out["reasons"])


def test_supported_claim_without_an_inspected_source_is_rejected(d):
    d.to_stage("research")
    ev = json.loads(json.dumps(d.EVIDENCE))
    ev["claims"][0]["evidence"] = []
    rc, out = d.submit("research", ev)
    assert rc == 1 and "missing source" in out["reasons"][0]
    assert stages(d)["angle"] == "WAITING"


def test_every_source_blocked_is_blocked_input(d):
    d.cli("init")
    rc, out = d.submit("source", {"sources": [{"id": "s1", "kind": "url", "status": "blocked", "url": "https://x.example", "captured_at": "t", "method": "fetch", "blocker": "403 bot wall"}]})
    assert rc == 4 and out["code"] == "BLOCKED_INPUT" and overall(d) == "BLOCKED" and stages(d)["research"] == "WAITING"


def test_unresolved_claim_left_in_the_text_is_rejected(d):
    d.to_stage("validate")
    bad = DRAFT + "\nThe change will cut hosting costs by 30 percent worldwide.\n"
    rc, out = d.submit("validate", bad, report=d.FACTUAL)
    assert rc == 1 and any("unresolved claim c4" in r or "not found in the sources" in r for r in out["reasons"])


def test_invented_personal_experience_is_rejected_without_author_material(d):
    d.to_stage("draft")
    rc, out = d.submit("draft", DRAFT + "\nWhen I tested this on my own fleet, the numbers matched.\n")
    assert rc == 1 and any("experience" in r for r in out["reasons"])


def test_personal_experience_is_allowed_only_with_author_supplied_material(d):
    d.cli("init")
    (d.pkg / "sources").mkdir(parents=True, exist_ok=True)
    (d.pkg / "sources" / "source-002.md").write_text("Author note: I ran this change on my own fleet last spring and saw the same drop.\n")
    src = d.sources()
    src["sources"].append({"id": "s2", "kind": "author", "status": "captured", "file": "sources/source-002.md"})
    assert d.submit("source", src)[0] == 0
    d.submit("research", d.EVIDENCE)
    d.submit("angle", d.ANGLE)
    d.submit("outline", d.OUTLINE)
    assert d.submit("draft", DRAFT + "\nWhen I tested this on my own fleet, the numbers matched.\n")[0] == 0


def test_summary_only_angle_is_not_ready_with_author_opportunities(d):
    d.to_stage("angle")
    rc, out = d.submit("angle", dict(d.ANGLE, verdict="summary_only", contributions=[]))
    assert rc == 3 and out["code"] == "NOT_READY" and out["author_opportunities"][0]["id"] == "a1"
    assert overall(d) == "NOT_READY" and stages(d)["outline"] == "WAITING"


def test_author_experience_contribution_without_author_material_is_rejected(d):
    d.to_stage("angle")
    ang = dict(d.ANGLE, contributions=[{"id": "k1", "text": "My own benchmark result", "kind": "author_experience", "evidence_ids": []}])
    rc, out = d.submit("angle", ang)
    assert rc == 1 and "author_opportunities" in out["reasons"][0]


@pytest.mark.parametrize("text,needle", [
    (DRAFT + "\nA — dash.\n", "em dash"),
    (DRAFT + "\n| a | b |\n| --- | --- |\n| 1 | 2 |\n", "table"),
    (DRAFT + "\n```text\nunclosed\n", "code fence"),
    (DRAFT + "\nTODO add the real number here.\n", "placeholder"),
])
def test_v6_lint_failures_are_rejected(d, text, needle):
    d.to_stage("draft")
    rc, out = d.submit("draft", text)
    assert rc == 1 and any(needle in r for r in out["reasons"])


# ---- title and subtitle ------------------------------------------------------------------------------------------
def titles(d, **over):
    t = json.loads(json.dumps(d.TITLES))
    t.update(over)
    return t


@pytest.mark.parametrize("over,needle", [
    ({"candidates": ["only one title about a cache test"]}, "need at least 10"),
    ({"subtitle": "x" * 141}, "limit 140"),
    ({"subtitle": "A test report that changes how you read it. " * 1 + "y" * 100}, "limit 140"),
    ({"pick": "You won't believe this cache latency trick", "candidates": None}, "weak title"),
    ({"subtitle": "This is not a latency story, it is a cache story about the test report"}, "corrective contrast"),
    ({"subtitle": "A cache test on latency?"}, "question"),
    ({"subtitle": "Why unrelated blockchain governance matters for farmers and bakers"}, "does not cover"),
    ({"rationale": ""}, "rationale"),
])
def test_weak_title_or_subtitle_is_rejected(d, over, needle):
    d.to_stage("title")
    t = titles(d, **{k: v for k, v in over.items() if v is not None})
    if "pick" in over:
        t["candidates"] = d.TITLES["candidates"][:9] + [over["pick"]]
    rc, out = d.submit("title", t)
    assert rc == 1 and any(needle in r for r in out["reasons"]), out
    assert stages(d)["images"] == "WAITING"


def test_title_numbers_must_be_supported_by_the_body(d):
    d.to_stage("title")
    t = titles(d)
    t["candidates"][-1] = t["pick"] = "What a lab's cache test says about 99 percent latency gains"
    rc, out = d.submit("title", t)
    assert rc == 1 and any("not supported by the body" in r for r in out["reasons"])


# ---- images ------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("over,needle", [
    ({"license": "unknown"}, "license"),
    ({"license": ""}, "license"),
    ({"provenance": ""}, "provenance"),
    ({"caption": ""}, "caption"),
    ({"alt": "x"}, "alt text"),
    ({"is_video_frame": True}, "video frames"),
    ({"purpose": "A still from the talking head video"}, "video frames"),
    ({"method": "sourced"}, "source_url"),
    ({"path": "assets/missing.png"}, "file not found"),
])
def test_image_without_provenance_or_quality_is_rejected(d, over, needle):
    d.to_stage("images")
    rc, out = d.submit("images", d.images(**over))
    assert rc == 1 and any(needle in r for r in out["reasons"]), out
    assert stages(d)["critic"] == "WAITING" and not (d.pkg / "FINAL.md").exists()


def test_low_resolution_hero_fails_the_quality_bar(d):
    from .fakes import png
    d.to_stage("images")
    png(d.pkg / "assets" / "small.png", 400, 300)
    rc, out = d.submit("images", d.images(path="assets/small.png"))
    assert rc == 1 and any("quality bar" in r for r in out["reasons"])


def test_images_need_a_hero_or_a_reason_for_none(d):
    d.to_stage("images")
    assert d.submit("images", {"images": []})[0] == 1
    assert d.submit("images", {"images": [], "waived_reason": "A data-only note; any picture would be decoration."})[0] == 0


# ---- model unavailable --------------------------------------------------------------------------------------------
def test_critic_model_unavailable_blocks_and_recovers(d):
    d.to_stage("critic")
    d.critic.replies = [unavailable()]
    rc, out = d.cli("run", "critic")
    assert rc == 4 and out["code"] == "BLOCKED" and overall(d) == "BLOCKED" and stages(d)["critic"] == "BLOCKED"
    assert d.cli("finalize")[0] == 2 and not (d.pkg / "FINAL.md").exists()  # no self-review fallback
    no_publish(d)
    assert d.cli("run", "critic")[0] == 0 and overall(d) == "IN_PROGRESS"


def test_malformed_critic_output_fails_and_does_not_burn_a_round(d):
    d.to_stage("critic")
    d.critic.replies = ["not json at all"]
    rc, out = d.cli("run", "critic")
    assert rc == 1 and json.loads((d.pkg / "write-pipeline/state.json").read_text())["critic"]["rounds"] == 0


def test_review_model_unavailable_blocks(d):
    d.to_stage("review")
    d.runner.review_rc = 2
    rc, out = d.cli("run", "review")
    assert rc == 4 and stages(d)["review"] == "BLOCKED" and stages(d)["title"] == "WAITING"


def test_voice_gate_unavailable_blocks_instead_of_passing(d):
    d.to_stage("voice")
    d.runner.gate = "ERROR"
    rc, out = d.submit("voice", VOICE, report=UNSLOP)
    assert rc == 4 and stages(d)["voice"] == "BLOCKED" and overall(d) == "BLOCKED"


def test_agent_can_record_that_its_own_model_was_unavailable(d):
    d.to_stage("draft")
    rc, out = d.cli("block", "draft", "--reason", "claude -p session limit reached")
    assert rc == 4 and overall(d) == "BLOCKED" and stages(d)["validate"] == "WAITING"


# ---- integrity failures ---------------------------------------------------------------------------------------------
def test_unrecoverable_integrity_failure_is_quarantined_and_sticks(d):
    d.to_stage("integrity")
    d.runner.authorize_rc = 3
    rc, out = d.cli("finalize")
    assert rc == 5 and overall(d) == "QUARANTINED" and (d.pkg / "QUARANTINE.json").exists()
    seen = len(d.runner.authorize_seen)
    d.runner.authorize_rc = 0
    rc, out = d.cli("run", "integrity")
    assert rc == 5 and len(d.runner.authorize_seen) == seen  # same bytes, same verdict, no retry loop
    assert stages(d)["hash"] == stages(d)["package"] == stages(d)["stop"] == "WAITING"
    assert not (d.pkg / "PACKAGE.md").exists()
    no_publish(d)


def test_quarantine_clears_only_when_the_bytes_change(d):
    d.to_stage("integrity")
    d.runner.authorize_rc = 3
    d.cli("finalize")
    # new upstream bytes (a different voice pass) change the candidate, so the old verdict no longer applies
    d.submit("voice", VOICE.replace("Anyone", "A reader"), report=UNSLOP)
    assert overall(d) == "IN_PROGRESS"


def test_evaluator_infrastructure_failure_blocks_and_retries(d):
    d.to_stage("integrity")
    d.runner.authorize_rc = 4
    rc, out = d.cli("finalize")
    assert rc == 4 and overall(d) == "BLOCKED"
    d.runner.authorize_rc = 0
    assert d.cli("finalize")[0] == 0 and overall(d) == "READY_FOR_REVIEW"


def test_final_bytes_that_drift_from_the_reference_never_reach_the_evaluator(d):
    d.to_stage("integrity")
    st = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    path = d.pkg / st["candidate"]["path"]
    path.write_text(path.read_text().replace("[test report](https://example.com/lab-report)", "test report"))
    rc, out = d.cli("run", "integrity")
    assert rc == 3 and "changed on disk" in out["reasons"][0] and d.runner.n("scripts.fingerprint_eval.release") == 0
    assert overall(d) == "NOT_READY"


def test_user_edit_that_removes_a_link_after_pass_ends_not_ready(d):
    d.to_stage("integrity")
    d.cli("finalize")
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("[test report](https://example.com/lab-report)", "test report"))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY"
    assert "MISSING_LINK" in json.loads((d.pkg / "write-pipeline/state.json").read_text())["stages"]["integrity"]["categories"]


def test_user_edit_that_changes_a_short_claim_after_pass_ends_not_ready(d):
    d.same_text(SHORT).to_stage("integrity")
    d.cli("finalize")
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("The API is deprecated.", "The API is supported."))
    rc, out = d.cli("revalidate")
    assert rc == 3 and "frozen block" in json.dumps(out) + (d.pkg / "write-pipeline/state.json").read_text()


def test_user_edit_deleting_a_sentence_after_pass_is_caught(d):
    d.to_stage("integrity")
    d.cli("finalize")
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace(" Median latency fell from 120 ms to 85 ms after the change.", ""))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY"
    for n in ("hash", "package", "stop"):
        assert stages(d)[n] in ("WAITING", "STALE")
    assert not json.loads((d.pkg / "write-pipeline/state.json").read_text())["awaiting_review"]


def test_critic_unavailable_during_revalidate_blocks_without_packaging(d):
    d.to_stage("integrity")
    d.cli("finalize")
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    d.critic.replies = [unavailable()]
    rc, out = d.cli("revalidate")
    assert rc == 4 and not json.loads((d.pkg / "write-pipeline/state.json").read_text()).get("awaiting_review")
    no_publish(d)
