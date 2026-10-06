"""Injection suite. After a final PASS on a fixture package (stub models), each tampering ends in the right non-READY state and nothing publishes.
(a) a user edit, (b) a removed link, (c) a changed number, (d) a deleted factual sentence, (e) a changed short claim, (f) an image without
provenance, (g) the gateway unavailable, (h) a forged state."""
import json

from .fakes import DRAFT
from .test_failures import SHORT, no_publish, overall, stages

NOT_READY_STATES = ("NOT_READY", "USER_MODIFIED", "BLOCKED", "QUARANTINED", "IN_PROGRESS")


def passed(d, text=None):
    if text:
        d.same_text(text)
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0 and overall(d) == "READY_FOR_REVIEW"
    return d.pkg / "FINAL.md"


def state_json(d) -> dict:
    return json.loads((d.pkg / "write-pipeline/state.json").read_text())


def assert_not_ready_outputs(d, banner=True):
    assert overall(d) != "READY_FOR_REVIEW" and not state_json(d).get("awaiting_review")
    if banner:
        assert "NOT READY" in (d.pkg / "FINAL.md").read_text() and "NOT_READY" in (d.pkg / "PACKAGE.md").read_text()
    no_publish(d)


def test_a_user_edit_invalidates_the_pass_and_revalidate_reproves_it(d):
    p = passed(d)
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    rc, out = d.cli("status", "--json")
    assert rc == 6 and out["overall"] == "USER_MODIFIED" and all(stages(d)[n] == "STALE" for n in ("integrity", "hash", "package", "stop"))
    assert d.cli("run", "package")[0] == 6 and d.cli("finalize")[0] == 6  # nothing proceeds on edited bytes
    assert d.cli("revalidate")[0] == 0 and overall(d) == "READY_FOR_REVIEW"  # the only way back is a full re-proof of the exact new bytes


def test_a_user_edit_that_the_gate_rejects_ends_not_ready(d):
    p = passed(d)
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    d.runner.gate = "FAIL"
    d.runner.authorize_rc = 1  # the final gate refuses the edited bytes
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY"
    no_publish(d)


def test_b_a_removed_link_ends_not_ready(d):
    p = passed(d)
    p.write_text(p.read_text().replace("[test report](https://example.com/lab-report)", "test report"))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY" and "MISSING_LINK" in state_json(d)["stages"]["integrity"]["categories"]
    assert_not_ready_outputs(d, banner=False)  # the user's own bytes stay as they are; the verdict is in state


def test_c_a_changed_number_ends_not_ready(d):
    p = passed(d)
    p.write_text(p.read_text().replace("120 ms to 85 ms", "120 ms to 58 ms"))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY" and "CONTENT_CLAIM_FAILURE" in state_json(d)["stages"]["integrity"]["categories"]
    assert_not_ready_outputs(d, banner=False)


def test_d_a_deleted_factual_sentence_ends_not_ready(d):
    p = passed(d)
    p.write_text(p.read_text().replace(" Median latency fell from 120 ms to 85 ms after the change.", ""))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY"
    assert_not_ready_outputs(d, banner=False)


def test_e_a_changed_short_claim_ends_not_ready(d):
    p = passed(d, SHORT)
    p.write_text(p.read_text().replace("The API is deprecated.", "The API is supported."))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY" and "frozen block" in json.dumps(state_json(d)["stages"]["integrity"])
    assert_not_ready_outputs(d, banner=False)


def test_f_an_image_without_provenance_never_reaches_a_pass(d):
    p = passed(d)
    p.write_text(p.read_text() + "\n![Unlicensed stock photo of servers](assets/stock.png)\n\n*A photo.*\n")
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY" and "images changed" in json.dumps(state_json(d)["stages"]["integrity"]["reasons"]) or overall(d) == "NOT_READY"
    assert_not_ready_outputs(d, banner=False)
    # and at the source: an images submission with no provenance is rejected outright
    rc, out = d.submit("images", d.images(provenance="", license="unknown"))
    assert rc == 1 and any("provenance" in r or "license" in r for r in out["reasons"])


def test_g_gateway_unavailable_is_an_error_not_a_pass_and_the_bytes_stay(d):
    p = passed(d)
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    edited = p.read_bytes()
    d.runner.authorize_rc = 4  # the evaluator cannot reach its gateway
    rc, out = d.cli("revalidate")
    assert rc == 4 and overall(d) == "BLOCKED" and p.read_bytes() == edited  # ERROR (BLOCKED), FINAL.md byte for byte as the user left it
    assert not state_json(d).get("awaiting_review") and stages(d)["stop"] != "DONE"
    d.runner.authorize_rc = 0
    assert d.cli("finalize")[0] == 0 and overall(d) == "READY_FOR_REVIEW"  # the retry succeeds once the gateway is back


def test_g2_gateway_error_in_the_critic_or_the_gate_never_marks_ready(d):
    from .fakes import unavailable
    p = passed(d)
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    edited = p.read_bytes()
    d.critic.replies = [unavailable()]
    rc, out = d.cli("revalidate")
    assert rc == 4 and p.read_bytes() == edited and overall(d) in ("BLOCKED", "USER_MODIFIED")


def test_h_a_forged_state_is_not_ready(d):
    passed(d)
    path = d.pkg / "write-pipeline/state.json"
    s = json.loads(path.read_text())
    s["stages"]["stop"]["status"] = "DONE"
    s["final"]["sha256"] = "0" * 64  # edited without the record key: the signature no longer matches
    path.write_text(json.dumps(s))
    rc, out = d.cli("status", "--json")
    assert rc == 3 and out["overall"] == "NOT_READY" and "signature" in json.dumps(out["invalid"]).lower() or out["overall"] == "NOT_READY"
    assert list((d.pkg / "write-pipeline").glob("state.json.invalid-*"))  # the forged file is kept aside, never repaired silently
    assert d.cli("finalize")[0] == 3 and d.cli("run", "stop")[0] == 3
    assert not state_json(d).get("awaiting_review")
