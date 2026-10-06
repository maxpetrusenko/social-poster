"""Editor-style convergence: round 1 is a full review, later rounds are scoped to prior findings plus the blocks that changed."""
import json

OLD = "The report covers one workload on one fleet."
NEW = "According to the report, it covers one workload on one fleet."
UNCHANGED = "Median latency fell from 120 ms to 85 ms after the change."
ROUND1 = {"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": OLD, "reason": "stated as bare fact", "fix": "attribute it to the report"}]}


def candidate(d) -> str:
    return (d.pkg / json.loads((d.pkg / "write-pipeline/state.json").read_text())["candidate"]["path"]).read_text()


def round2(d, reply):
    """Round 1 finds F1, a repair rewords the F1 sentence, then the critic's round-2 `reply` is played."""
    d.to_stage("critic")
    d.critic.replies = [ROUND1, reply]
    assert d.cli("run", "critic")[1]["majors"] == 1
    f = d.write("repair.md", candidate(d).replace(OLD, NEW))
    assert d.cli("repair", "try", "--file", str(f))[1]["code"] == "ACCEPTED"
    return d.cli("run", "critic")


def new_major(passage):
    return {"id": "N1", "severity": "major", "passage": passage, "reason": "wording is too strong", "fix": "soften it"}


def by_id(out):
    return {f["id"]: f for f in out["findings"]}


def test_round_two_is_scoped_and_shows_prior_findings_and_changed_blocks(d):
    rc, out = round2(d, {"verdict": "pass", "findings": [], "resolutions": [{"id": "F1", "status": "resolved", "evidence": "now attributed to the report"}]})
    p = d.critic.prompts[1]
    assert "PRIOR OPEN FINDINGS" in p and "F1" in p and OLD in p and "CHANGED BLOCKS" in p and "REPAIR REPORT" in p
    changed = p.split("=== CHANGED BLOCKS")[1].split("=== ARTICLE")[0]
    assert NEW in changed and UNCHANGED not in changed
    assert "SCOPED" not in d.critic.prompts[0] and "PRIOR OPEN FINDINGS" not in d.critic.prompts[0]  # round 1 stays a full review


def test_new_major_on_unchanged_text_is_downgraded_to_a_suggestion(d):
    rc, out = round2(d, {"verdict": "revise", "findings": [new_major(UNCHANGED)], "resolutions": [{"id": "F1", "status": "resolved", "evidence": "attributed"}]})
    n = by_id(out)["N1"]
    assert n["severity"] == "minor" and n["original_severity"] == "major" and n["suggestion"] is True
    assert n["downgrade_reason"] == "unchanged text, outside scoped review"
    assert out["majors"] == 0
    pm = (d.pkg / "PACKAGE.md").read_text() if (d.pkg / "PACKAGE.md").exists() else ""
    if pm:
        assert "unchanged text, outside scoped review" in pm


def test_resolved_prior_finding_clears(d):
    rc, out = round2(d, {"verdict": "pass", "findings": [], "resolutions": [{"id": "F1", "status": "resolved", "evidence": "now attributed to the report"}]})
    f1 = by_id(out)["F1"]
    assert out["majors"] == 0 and f1["severity"] == "resolved" and f1["resolution"] == "resolved"


def test_new_major_inside_a_changed_block_counts(d):
    rc, out = round2(d, {"verdict": "revise", "findings": [new_major("it covers one workload on one fleet")],
                         "resolutions": [{"id": "F1", "status": "resolved", "evidence": "attributed"}]})
    n = by_id(out)["N1"]
    assert n["severity"] == "major" and not n.get("suggestion") and out["majors"] == 1


def test_unanswered_or_unevidenced_prior_finding_stays_unresolved(d):
    rc, out = round2(d, {"verdict": "revise", "findings": [], "resolutions": []})
    assert out["majors"] == 1 and by_id(out)["F1"]["severity"] == "major"


def test_ready_is_reachable_when_all_prior_majors_are_resolved_and_minors_do_not_block(d):
    rc, out = round2(d, {"verdict": "revise", "findings": [new_major(UNCHANGED)], "resolutions": [{"id": "F1", "status": "resolved", "evidence": "attributed"}]})
    assert out["majors"] == 0
    assert d.cli("repair", "done")[0] == 0
    assert d.cli("fpverify", "done")[0] == 0
    assert d.cli("finalize")[0] == 0
    pm = (d.pkg / "PACKAGE.md").read_text()
    assert "READY" in pm.split("## READY/NOT_READY")[1] and "Editor note" in pm and "unchanged text, outside scoped review" in pm


def test_budget_stays_three_and_is_not_refilled(d):
    d.to_stage("critic")
    open_reply = {"verdict": "revise", "findings": [], "resolutions": [{"id": "F1", "status": "unresolved", "evidence": "still bare"}]}
    d.critic.replies = [ROUND1, open_reply, open_reply, open_reply]
    d.cli("run", "critic")
    for i, phrase in enumerate(("As the report notes, it covers", "The report says it covers"), 1):
        f = d.write(f"r{i}.md", candidate(d).replace("The report covers", phrase, 1).replace("As the report notes, it covers", phrase, 1))
        assert d.cli("repair", "try", "--file", str(f))[0] == 0
        rc, out = d.cli("run", "critic")
    assert rc == 3 and out["code"] == "NOT_READY" and len(d.critic.prompts) == 3
    f = d.write("r3.md", candidate(d).replace("The report says it covers", "The report states it covers"))
    d.cli("repair", "try", "--file", str(f))
    rc, out = d.cli("run", "critic")
    assert rc == 3 and len(d.critic.prompts) == 3
