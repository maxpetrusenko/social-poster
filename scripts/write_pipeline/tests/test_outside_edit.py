"""An agent that edits an article copy outside the pipeline and says "verified by V6 lint" is never reported as verified.
Only a pipeline run (repair try / revalidate) on the exact bytes can make them READY."""
import json

from .fakes import sha
from .test_failures import no_publish, overall, stages
from .test_injection import passed, state_json
from .test_repair_adds import candidate, major_open, try_repair

LINK_SENTENCE = "A lab ran a latency test on 40 nodes in 2025 and published the numbers in its [test report](https://example.com/lab-report)."
REWRITE = "A lab ran a latency test on 40 nodes in 2025 and reported the numbers in its [test report](https://example.com/lab-report)."
CLAIM = "\n\nVerified by V6 lint: clean. Claims gate: PASS. Links preserved.\n"


def test_edited_final_copy_with_a_claim_of_v6_lint_is_user_modified_not_verified(d):
    p = passed(d)
    good_sha = sha(p.read_bytes())
    assert LINK_SENTENCE in p.read_text()
    p.write_text(p.read_text().replace(LINK_SENTENCE, REWRITE))  # the edit made outside the pipeline
    pk = d.pkg / "PACKAGE.md"
    pk.write_text(pk.read_text() + CLAIM)  # and the claim that it was checked
    rc, out = d.cli("status", "--json")
    assert rc == 6 and out["overall"] == "USER_MODIFIED"
    assert all(stages(d)[n] == "STALE" for n in ("integrity", "hash", "package", "stop"))
    assert d.cli("run", "package")[0] == 6 and d.cli("finalize")[0] == 6  # nothing downstream accepts the edited bytes
    assert sha(p.read_bytes()) != good_sha and REWRITE in p.read_text()  # the user's bytes are untouched, never overwritten, never blessed
    assert not state_json(d).get("awaiting_review")
    no_publish(d)
    seen = len(d.runner.authorize_seen)
    assert d.cli("revalidate")[0] == 0  # only a full re-proof of the exact new bytes clears it
    assert d.runner.authorize_seen[seen:] == [sha(p.read_bytes())] and overall(d) == "READY_FOR_REVIEW"


def test_revalidate_of_the_edited_copy_that_loses_the_link_is_rejected_despite_the_claim(d):
    p = passed(d)
    p.write_text(p.read_text().replace("[test report](https://example.com/lab-report)", "test report") + CLAIM)
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY"  # the guard, not the note, decides
    assert "MISSING_LINK" in state_json(d)["stages"]["integrity"]["categories"]
    no_publish(d)


def test_candidate_file_edited_on_disk_forces_revalidation_and_is_never_reported_verified(d):
    d.to_stage("integrity")
    path = d.pkg / state_json(d)["candidate"]["path"]
    path.write_text(path.read_text().replace(LINK_SENTENCE, REWRITE) + CLAIM)
    rc, out = d.cli("run", "integrity")
    assert rc == 3 and "changed on disk" in out["reasons"][0] and d.runner.n("scripts.fingerprint_eval.release") == 0
    assert overall(d) == "NOT_READY" and "Verified by V6 lint" not in (d.pkg / "FINAL.md").read_text()
    no_publish(d)


def test_submitting_the_edited_copy_to_repair_with_a_verified_claim_still_goes_through_the_guard(d):
    major_open(d)
    cand = candidate(d)
    f = d.write("repair.md", cand.replace(LINK_SENTENCE, REWRITE))
    r = d.write("repair.report.json", {"verified_by": "V6 lint", "verified": True, "removals": []})
    rc, out = d.cli("repair", "try", "--file", str(f), "--report", str(r))
    assert rc == 1 and any("without a declaration" in x for x in out["reasons"]), out  # a claim in the report changes nothing
    assert LINK_SENTENCE in candidate(d) and REWRITE not in candidate(d)
    assert json.dumps(state_json(d)).count("V6 lint") == 0
