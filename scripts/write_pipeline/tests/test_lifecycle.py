"""The final gate on exact bytes, user edits after PASS, critic and repair loops, and the no-publish guarantee."""
import json
import re
from pathlib import Path

from scripts.write_pipeline import core

from .fakes import sha


def final_run(d):
    d.to_stage("integrity")
    return d.cli("finalize")


def st(d):
    return d.cli("status", "--json")[1]


def test_final_gate_runs_on_the_exact_final_bytes(d):
    rc, out = final_run(d)
    assert rc == 0
    final = (d.pkg / "FINAL.md").read_bytes()
    assert d.runner.authorize_seen == [sha(final)]  # the evaluator saw FINAL.md, byte for byte
    assert json.loads((d.pkg / "write-pipeline/artifacts/18-hash.json").read_text())["final_sha256"] == sha(final)
    assert (d.pkg / "version.json").exists() and json.loads((d.pkg / "version.json").read_text())["finalFile"] == "FINAL.md"
    ref = json.loads(next((d.pkg / "evals").glob("prepublish-v*.json")).read_text())
    assert sha((d.pkg / ref["articleFile"]).read_bytes()) == ref["articleSha256"]  # the pre-anti-fingerprint reference is hash bound


def test_final_gate_always_reruns_even_when_every_input_is_unchanged(d):
    final_run(d)
    n_auth, n_run = len(d.runner.authorize_seen), d.runner.n("scripts.fingerprint_eval.release")
    for _ in range(2):
        rc, out = d.cli("run", "integrity")
        assert rc == 0 and out["cached"] is False
    assert len(d.runner.authorize_seen) == n_auth + 2 and d.runner.n("scripts.fingerprint_eval.release") == n_run + 4  # authorize + verify each time
    assert st(d)["overall"] == "READY_FOR_REVIEW"  # a rerun on identical bytes does not churn the downstream stages


def test_verify_for_other_bytes_is_not_a_pass(d):
    d.to_stage("integrity")
    d.runner.verify_sha = "0" * 64
    rc, out = d.cli("run", "integrity")
    assert rc == 3 and "does not confirm the exact final bytes" in out["reasons"][0]
    assert st(d)["overall"] == "NOT_READY"


def test_user_edit_after_pass_is_detected_and_invalidates_final_stages(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    rc, s = d.cli("status", "--json")
    assert rc == 6 and s["overall"] == "USER_MODIFIED"
    by = {r["stage"]: r["state"] for r in s["stages"]}
    assert all(by[n] == "STALE" for n in ("integrity", "hash", "package", "stop"))
    assert all(by[n] == "DONE" for n in core.NAMES[:12])  # analysis upstream of the edit stays cached
    for cmd in (["run", "package"], ["finalize"], ["begin", "critic"]):
        assert d.cli(*cmd)[0] == 6  # nothing proceeds on the stale state


def test_revalidate_reruns_critic_and_the_final_gate_then_repackages(d):
    final_run(d)
    old = st(d)["final"]["sha256"]
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    crit, auth, rev = len(d.critic.prompts), len(d.runner.authorize_seen), d.runner.n("scripts.medium_review")
    rc, out = d.cli("revalidate")
    assert rc == 0, out
    s = st(d)
    assert s["overall"] == "READY_FOR_REVIEW" and s["final"]["sha256"] == sha(p.read_bytes()) != old
    assert len(d.critic.prompts) == crit + 1 and len(d.runner.authorize_seen) == auth + 1 and d.runner.n("scripts.medium_review") == rev + 1
    assert d.runner.authorize_seen[-1] == sha(p.read_bytes())
    assert "in a few lines" in (d.pkg / "FINAL.html").read_text() and sha(p.read_bytes()) in (d.pkg / "PACKAGE.md").read_text()
    assert d.cli("revalidate")[1]["note"].startswith("FINAL.md is unchanged")


def test_user_edit_that_changes_a_claim_fails_closed_and_needs_an_explicit_author_rebase(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("40 nodes", "400 nodes"))
    rc, out = d.cli("revalidate")
    assert rc == 3 and st(d)["overall"] == "NOT_READY"
    rc, out = d.cli("rebase", "--reason", "author corrected the node count after checking the report")
    assert rc == 0 and out["old_reference_sha256"] != out["new_reference_sha256"]
    assert d.cli("finalize")[0] == 0
    s = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    assert s["overrides"][0]["by"] == "author" and s["overrides"][0]["reason"].startswith("author corrected")


def test_rebase_is_refused_unless_the_candidate_is_an_author_edit(d):
    final_run(d)
    rc, out = d.cli("rebase", "--reason", "skip the gate please")
    assert rc == 2 and "author edit" in out["reasons"][0]


def test_critic_major_then_safe_repair_then_pass(d):
    d.to_stage("critic")
    d.critic.replies = [{"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": "The report covers one workload on one fleet.",
                                                            "reason": "stated as bare fact", "fix": "attribute it to the report"}]}]
    rc, out = d.cli("run", "critic")
    assert rc == 0 and out["majors"] == 1 and out["round"] == 1
    assert d.cli("repair", "done")[0] == 2  # an open major blocks the stage
    cand = candidate(d)
    fixed = cand.replace("The report covers one workload on one fleet.", "According to the report, it covers one workload on one fleet.")
    f = d.write("repair.md", fixed)
    rc, out = d.cli("repair", "try", "--file", str(f))
    assert rc == 0 and out["code"] == "ACCEPTED"
    assert {r["stage"]: r["state"] for r in st(d)["stages"]}["critic"] == "STALE"  # the critic must now see the new bytes
    assert d.cli("run", "critic")[1]["round"] == 2
    assert d.cli("repair", "done")[0] == 0
    assert d.cli("fpverify", "done")[0] == 0
    assert d.cli("finalize")[0] == 0
    assert (d.pkg / "FINAL.md").read_text() == fixed


def candidate(d) -> str:
    return (d.pkg / json.loads((d.pkg / "write-pipeline/state.json").read_text())["candidate"]["path"]).read_text()


def test_critic_loop_is_capped_at_three_rounds(d):
    d.to_stage("critic")
    major = {"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": "Median latency fell from 120 ms to 85 ms after the change.", "reason": "x"}]}
    d.critic.replies = [major, major, major, major]
    d.cli("run", "critic")
    for i, phrase in enumerate(("As the report notes, it covers", "The report says it covers"), 1):
        f = d.write(f"r{i}.md", candidate(d).replace("The report covers", phrase, 1).replace("As the report notes, it covers", phrase, 1))
        assert d.cli("repair", "try", "--file", str(f))[0] == 0
        rc, out = d.cli("run", "critic")
    assert rc == 3 and out["code"] == "NOT_READY" and "exhausted" in out["reasons"][0]
    assert st(d)["overall"] == "NOT_READY" and len(d.critic.prompts) == 3
    assert d.cli("finalize")[0] == 2
    assert "NOT READY" in (d.pkg / "FINAL.md").read_text() and "OPEN major F1" in (d.pkg / "PACKAGE.md").read_text()  # written by the CLI itself


def test_repair_that_needs_a_claim_change_is_rejected_then_ends_not_ready(d):
    d.to_stage("critic")
    d.critic.replies = [{"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": "from 120 ms to 85 ms", "reason": "number looks wrong"}]}]
    d.cli("run", "critic")
    cand = candidate(d)
    f = d.write("bad.md", cand.replace("120 ms", "130 ms"))
    for i in (1, 2):
        rc, out = d.cli("repair", "try", "--file", str(f))
        assert rc == 1 and any("number" in r for r in out["reasons"])
    rc, out = d.cli("repair", "try", "--file", str(f))
    assert rc == 3 and "claim change" in out["reasons"][0] and st(d)["overall"] == "NOT_READY"


def test_critic_findings_with_invented_quotes_do_not_count_as_major(d):
    d.to_stage("critic")
    d.critic.replies = [{"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": "a sentence the article never contains", "reason": "bad"}]}]
    rc, out = d.cli("run", "critic")
    assert rc == 0 and out["majors"] == 0 and out["findings"][0]["verified"] is False


def test_critic_is_a_separate_context_that_sees_only_framework_evidence_and_article(d):
    d.to_stage("critic")
    assert d.cli("run", "critic")[0] == 0
    p = d.critic.prompts[-1]
    assert "framework v6" in p and "EVIDENCE LEDGER" in p and "What the numbers leave open" in p
    assert "write-pipeline" not in p and "antifp" not in p


def test_nothing_ever_publishes(d):
    final_run(d)
    allowed = {"scripts.fingerprint_eval.run", "scripts.fingerprint_eval.release", "scripts.medium_review", "scripts.publish_route"}
    assert {m for m, _ in d.runner.calls} <= allowed
    for m, argv in d.runner.calls:
        if m == "scripts.publish_route":
            assert argv[3] in ("decide", "verify")  # recommendation or read-only verify, never repair
        if m == "scripts.fingerprint_eval.release":
            assert argv[3] in ("authorize", "verify")
    s = st(d)
    assert s["published"] is False and s["awaiting_review"] is True
    assert "Nothing was published" in (d.pkg / "PACKAGE.md").read_text()
    src = "\n".join(p.read_text() for p in Path(core.__file__).parent.glob("*.py"))
    assert not re.search(r"publish_broker|medium_publish_guard|browser|playwright|requests\.post", src)
    assert not re.search(r"gptzero|originality\.ai|zerogpt|copyleaks|turnitin|winston", src, re.I)  # no third-party detector is ever named, let alone called


def test_package_has_every_report_section_and_html_contract(d):
    final_run(d)
    pm = (d.pkg / "PACKAGE.md").read_text()
    from scripts.write_pipeline.report import HEADINGS, SECTIONS
    heads = re.findall(r"^## (.+)$", pm, re.M)
    assert heads == [HEADINGS.get(k, k) for k in SECTIONS] and heads[0] == "TITLE" and heads[-1] == "READY/NOT_READY"
    assert "Add your own latency measurements" in pm and "Unresolved claim left out" in pm  # topical real gaps surface as author suggestions
    assert "career journey" not in pm and "omitted (too little overlap" in pm  # an off-topic suggestion is dropped, never shown
    html = (d.pkg / "FINAL.html").read_text()
    assert re.search(r"<h1>.*</h1>\s*<h3>.*</h3>", html, re.S) and "<table" not in html
    assert re.search(r"[A-Za-z]:?\s*DIRECT_PUBLISH", pm) or "A DIRECT_PUBLISH" in pm


def test_status_shows_every_stage_state(d):
    d.to_stage("review")
    rc, out = d.cli("status")
    lines = [ln for ln in out.splitlines() if re.match(r"\s*\d+ ", ln)]
    assert len(lines) == 20 and sum(" DONE " in ln for ln in lines) == 10


def _evaluator_clean() -> bool:
    import subprocess
    p = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "--", "scripts/fingerprint_eval", ":(exclude)scripts/fingerprint_eval/tests"],
                       capture_output=True, text=True, cwd=Path(__file__).resolve().parents[3])
    return p.returncode == 0 and not p.stdout.strip()


def test_real_release_gate_on_the_exact_bytes_with_a_private_active_selector(d, monkeypatch, tmp_path):
    """The real release authorize + verify (no stub): byte-identical final and reference take the evaluator's identity path, which needs no model."""
    import pytest
    from scripts.fingerprint_eval.contracts import RELEASE_ARTICLE
    from scripts.write_pipeline import editguard as G
    if not _evaluator_clean():
        pytest.skip("evaluator tree is dirty: release authorize refuses to run (commit first)")
    from scripts.write_pipeline import verify
    monkeypatch.setattr(verify, "record_check", verify.real_record_check)  # the real signed authorization and record, not the offline stand-in
    d.to_stage("integrity")
    real = G.make_runner(d.pkg / "write-pipeline" / "workspace")
    stub = d.runner
    d.runner = lambda argv: real(argv) if argv[2] == "scripts.fingerprint_eval.release" else stub(argv)
    rc, out = d.cli("finalize")
    assert rc == 0, out
    assert (d.pkg / "release" / "authorization.json").exists() and (d.pkg / RELEASE_ARTICLE).read_bytes() == (d.pkg / "FINAL.md").read_bytes()
    assert (d.pkg / "write-pipeline" / "workspace" / "release" / "ACTIVE.json").exists()  # not the production selector
    # a one-byte change after PASS is no longer authorized, and the pipeline says so
    (d.pkg / "FINAL.md").write_text((d.pkg / "FINAL.md").read_text() + "\n")
    assert d.cli("status", "--json")[1]["overall"] == "USER_MODIFIED"
