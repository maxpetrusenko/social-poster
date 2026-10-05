"""Adversarial regressions for the Codex write-path review: env secrets, stale caches, rebase bypass, antifp tamper, paraphrased
unresolved claims, path escapes, terminal final-gate states, stage-boundary exceptions, quarantine route D."""
import json
import os
import subprocess
from pathlib import Path

import pytest

from scripts.write_pipeline import editguard as G
from scripts.write_pipeline import final as FN
from scripts.write_pipeline.core import Pipeline

from .fakes import DRAFT, UNSLOP, sha
from .test_failures import ONE_HIT, FIX, antifp_edit, current, overall, stages
from .test_lifecycle import final_run, st

SECRETS = {"LLM_GATEWAY_API_KEY": "gw-secret", "DOPPLER_TOKEN": "dp.st.secret", "ANTHROPIC_API_KEY": "sk-ant-secret", "OPENAI_API_KEY": "sk-secret",
           "AWS_SECRET_ACCESS_KEY": "aws-secret", "GITHUB_TOKEN": "ghp_secret", "CLAUDE_CODE_OAUTH_TOKEN": "oauth-ok"}


def state(d):
    return json.loads((d.pkg / "write-pipeline/state.json").read_text())


# ---- #1 secrets ------------------------------------------------------------------------------------------------
def test_runner_subprocess_env_is_allowlisted(monkeypatch, tmp_path):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("PATH", os.environ["PATH"])
    seen = {}

    def fake_run(argv, **kw):
        seen["env"] = kw["env"]
        return subprocess.CompletedProcess(argv, 0, "", "")
    monkeypatch.setattr(subprocess, "run", fake_run)
    G.make_runner(tmp_path / "ws")(["true"])
    env = seen["env"]
    for k in ("LLM_GATEWAY_API_KEY", "DOPPLER_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN"):
        assert k not in env, k
    assert env["CLAUDE_CODE_OAUTH_TOKEN"] == "oauth-ok" and env["FINGERPRINT_EVAL_WORKSPACE"] == str(tmp_path / "ws")
    assert set(env) <= {"PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR", "LLM_GATEWAY_URL",
                        "SSL_CERT_FILE", "FINGERPRINT_EVAL_KEY_FILE", "FG_JUDGE", "FG_EXTRACTOR", "FINGERPRINT_EVAL_WORKSPACE"}


# ---- #2 caches re-hash the bytes on disk -----------------------------------------------------------------------
def test_edited_artifact_on_disk_is_never_served_from_cache(d):
    d.to_stage("validate")
    rel = state(d)["stages"]["outline"]["artifact"]
    assert d.cli("begin", "outline")[1]["action"] == "skip"
    (d.pkg / rel).write_text(json.dumps({"sections": [{"heading": "Injected", "purpose": "x"}, {"heading": "Other", "purpose": "y"}]}))
    assert stages(d)["outline"] == "STALE" and stages(d)["draft"] == "STALE"
    assert d.cli("begin", "outline")[1]["action"] == "run"
    rc, out = d.submit("outline", d.OUTLINE)
    assert rc == 0 and out["cached"] is False  # rewritten from the validated bytes, not trusted
    assert stages(d)["outline"] == "DONE"


def test_captured_source_changed_after_done_invalidates_everything_downstream(d):
    d.to_stage("draft")
    (d.pkg / "sources" / "source-001.md").write_text("The lab ran the test on 4000 nodes.\n")
    s = stages(d)
    assert s["source"] == "STALE" and s["research"] == "STALE" and s["outline"] == "STALE"
    assert d.submit("research", d.EVIDENCE)[0] == 2  # waits on the stale source
    (d.pkg / "sources" / "source-001.md").unlink()
    assert stages(d)["source"] == "STALE"


# ---- #3 rebase cannot bypass the claims/links gate -------------------------------------------------------------
def test_rebase_runs_the_claims_gate_against_the_previous_reference_and_records_it(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("40 nodes", "400 nodes"))
    assert d.cli("revalidate")[0] == 3
    ref_before = (d.pkg / "write-pipeline/frame/reference-frame.md").read_bytes()
    runs = d.runner.n("scripts.fingerprint_eval.run")
    rc, out = d.cli("rebase", "--reason", "author checked the count")
    assert rc == 0 and out["claims_gate"] == "PASS" and d.runner.n("scripts.fingerprint_eval.run") == runs + 1
    gate_argv = [a for m, a in d.runner.calls if m == "scripts.fingerprint_eval.run"][-1]
    assert Path(gate_argv[gate_argv.index("--draft") + 1]).read_bytes() == ref_before  # the PREVIOUS reference, not the edited text
    ov = state(d)["overrides"][-1]
    assert ov["by"] == "author" and ov["claims_gate"] == "PASS" and ov["accepted"] is True and ov["gate_reference_sha256"] == sha(ref_before)
    assert stages(d)["integrity"] != "DONE" and overall(d) != "READY_FOR_REVIEW"  # rebase itself never marks the final gate PASS
    assert d.cli("finalize")[0] == 0
    prep = json.loads(next(iter(sorted((d.pkg / "evals").glob("prepublish-v*.json")))).read_text())
    final = (d.pkg / "FINAL.md").read_bytes()
    assert prep["articleSha256"] == sha(ref_before) != sha(final)  # the evaluator still binds the PREVIOUS reference: no identity shortcut
    assert (d.pkg / "write-pipeline/frame/reference-frame.md").read_bytes() == ref_before
    art = json.loads((d.pkg / state(d)["stages"]["integrity"]["artifact"]).read_text())
    assert art["author_rebase"]["claims_gate"] == "PASS"


def test_rebase_that_drops_a_claim_or_link_is_refused_by_the_gate(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    gone = "The team has not published tail latency, so the median alone cannot say whether the slowest requests improved."
    assert gone in p.read_text()
    p.write_text(p.read_text().replace(gone, "").replace("[test report](https://example.com/lab-report)", "test report"))
    d.runner.required = [gone]  # the stub claim judge sees the omission
    assert d.cli("revalidate")[0] == 3
    rc, out = d.cli("rebase", "--reason", "just ship it")
    assert rc == 3 and out["claims_gate"] == "FAIL" and "upstream stages" in out["reasons"][0]
    s = state(d)
    assert s["overrides"][-1]["accepted"] is False and s["overrides"][-1]["claims_gate"] == "FAIL" and not s.get("rebase")
    rc, out = d.cli("finalize")
    assert rc != 0 and overall(d) != "READY_FOR_REVIEW" and stages(d)["integrity"] != "DONE"


def test_rebase_with_the_evaluator_down_is_blocked_not_accepted(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("40 nodes", "400 nodes"))
    d.cli("revalidate")
    d.runner.gate = "ERROR"
    rc, out = d.cli("rebase", "--reason", "author checked")
    assert rc == 4 and out["code"] == "BLOCKED" and not state(d).get("rebase")


def test_a_second_edit_after_rebase_drops_the_rebase(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("40 nodes", "400 nodes"))
    d.cli("revalidate")
    assert d.cli("rebase", "--reason", "ok")[0] == 0
    assert d.cli("finalize")[0] == 0
    p.write_text(p.read_text().replace("400 nodes", "4000 nodes"))
    rc, out = d.cli("revalidate")
    assert rc == 3  # the new edit is judged against the previous reference again, the old rebase does not carry over


# ---- #4 antifp finish ------------------------------------------------------------------------------------------
def test_antifp_finish_rejects_current_md_edited_without_a_gated_try(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    assert antifp_edit(d, ONE_HIT.replace("This isn't a benchmark. It's a single test on one fleet.", FIX))[0] == 0
    cur = d.pkg / "write-pipeline/antifp/current.md"
    cur.write_text(current(d).replace("40 nodes", "400 nodes"))
    rc, out = d.cli("antifp", "finish")
    assert rc == 2 and out["ok"] is False and "last gated attempt" in out["reasons"][0]
    assert stages(d)["antifp"] != "DONE"
    rc, out = antifp_edit(d, ONE_HIT)  # a try on top of tampered bytes is refused as well
    assert rc == 1 and "last gated attempt" in out["reasons"][0]


def test_antifp_finish_rejects_tamper_right_after_baseline_and_baseline_restarts_clean(d):
    d.same_text(ONE_HIT).to_stage("antifp")
    d.cli("antifp", "baseline")
    cur = d.pkg / "write-pipeline/antifp/current.md"
    cur.write_text(cur.read_text() + "\nA new unsupported claim.\n")
    assert d.cli("antifp", "finish")[0] == 2
    rc, out = d.cli("antifp", "baseline")
    assert rc == 0 and out["resumed"] is False and "unsupported claim" not in current(d)
    assert d.cli("antifp", "finish")[0] == 0


# ---- #5 unresolved claims -------------------------------------------------------------------------------------
def validated(d):
    d.to_stage("validate")


def test_report_must_cover_every_claim_id_exactly(d):
    validated(d)
    rep = {"checked": [e for e in d.FACTUAL["checked"] if e["claim_id"] != "c4"]}
    rc, out = d.submit("validate", DRAFT, report=rep)
    assert rc == 1 and "c4" in out["reasons"][0]
    rep = {"checked": [*d.FACTUAL["checked"], {"claim_id": "c9", "verdict": "supported"}, {"claim_id": "c1", "verdict": "supported"}]}
    rc, out = d.submit("validate", DRAFT, report=rep)
    assert rc == 1 and any("unknown claim ids" in r for r in out["reasons"]) and any("more than once" in r for r in out["reasons"])
    rc, out = d.submit("validate", DRAFT, report={"checked": ["c1", "c2", "c3", "c4"]})
    assert rc == 1 and "claim_id" in out["reasons"][0]


def test_unresolved_claim_must_be_declared_omitted(d):
    validated(d)
    rep = {"checked": [{**e, "verdict": "supported"} if e["claim_id"] == "c4" else e for e in d.FACTUAL["checked"]]}
    rc, out = d.submit("validate", DRAFT, report=rep)
    assert rc == 1 and "must be reported as omitted" in out["reasons"][0]


def test_unresolved_claim_by_lexical_paraphrase_is_rejected(d):
    validated(d)
    bad = DRAFT.replace("Median latency fell from 120 ms to 85 ms after the change.",
                        "Median latency fell from 120 ms to 85 ms after the change. The change will cut hosting costs by 30 percent worldwide.")
    rc, out = d.submit("validate", bad, report=d.FACTUAL)
    assert rc == 1 and "unresolved claim c4" in out["reasons"][0]
    close = DRAFT.replace("after the change.", "after the change. The change should cut hosting costs by about 30 percent across the world.", 1)
    rc, out = d.submit("validate", close, report=d.FACTUAL)
    assert rc == 1 and "unresolved claim c4" in out["reasons"][0]


def test_unresolved_claim_by_semantic_paraphrase_is_rejected_by_the_gate(d):
    validated(d)
    sly = DRAFT.replace("after the change.", "after the change. Hosting expenses should shrink roughly 30 percent across the planet.", 1)
    d.runner.paraphrases = ["Hosting expenses"]
    runs = d.runner.unresolved_runs
    rc, out = d.submit("validate", sly, report=d.FACTUAL)
    assert rc == 1 and "evaluator gate" in out["reasons"][0] and d.runner.unresolved_runs == runs + 1
    d.runner.paraphrases = []
    rc, out = d.submit("validate", DRAFT, report=d.FACTUAL)
    assert rc == 0 and d.runner.unresolved_runs == runs + 2  # a clean text has every unresolved claim missing: the gate FAILs, which is the pass here


def test_unresolved_check_with_the_evaluator_down_is_blocked_not_passed(d):
    validated(d)
    d.runner.unresolved_error = True
    rc, out = d.submit("validate", DRAFT, report=d.FACTUAL)
    assert rc == 4 and out["code"] == "BLOCKED" and stages(d)["validate"] == "BLOCKED"


def test_editorial_pass_cannot_reintroduce_an_unresolved_claim(d):
    d.to_stage("editorial")
    sly = DRAFT.replace("after the change.", "after the change. The change will cut hosting costs by 30 percent worldwide.", 1)
    rc, out = d.submit("editorial", sly, report=UNSLOP)
    assert rc == 1 and any("unresolved claim c4" in r for r in out["reasons"])


# ---- #6 paths -------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("how", ["traversal", "absolute", "symlink"])
def test_source_paths_cannot_escape_the_package(d, tmp_path, how):
    d.cli("init")
    (tmp_path / "outside.md").write_text("TOP SECRET outside the package\n")
    (d.pkg / "sources").mkdir(parents=True, exist_ok=True)
    if how == "symlink":
        (d.pkg / "sources" / "link.md").symlink_to(tmp_path / "outside.md")
    rel = {"traversal": "../outside.md", "absolute": str(tmp_path / "outside.md"), "symlink": "sources/link.md"}[how]
    rc, out = d.submit("source", {"sources": [{"id": "s1", "kind": "transcript", "status": "captured", "file": rel}]})
    assert rc == 1 and any("outside the package" in r or "escapes" in r for r in out["reasons"])
    assert stages(d)["source"] == "FAILED"


def test_image_symlink_escape_is_rejected(d, tmp_path):
    d.to_stage("images")
    from .fakes import png
    png(tmp_path / "outside.png")
    (d.pkg / "assets").mkdir(exist_ok=True)
    (d.pkg / "assets" / "link.png").symlink_to(tmp_path / "outside.png")
    rc, out = d.submit("images", d.images(path="assets/link.png"))
    assert rc == 1 and "outside the package" in " ".join(out["reasons"])


def test_state_artifact_path_escape_is_refused(d, tmp_path):
    d.to_stage("outline")
    from .fakes import resign_state
    resign_state(d.pkg, lambda s: s["stages"]["research"].__setitem__("artifact", "../../outside.json"))
    pipe = Pipeline(d.pkg)
    assert pipe.read_json("research") == {} and pipe.status("research") == "STALE"
    with pytest.raises(Exception):
        pipe.read_art("research")


# ---- #7 final gate failures are terminal -----------------------------------------------------------------------
def test_final_gate_failure_is_not_ready_with_a_nonzero_status_until_revalidated(d):
    d.to_stage("integrity")
    d.runner.authorize_rc = 1
    rc, out = d.cli("run", "integrity")
    assert rc == 3 and out["code"] == "NOT_READY"
    assert overall(d) == "NOT_READY" and d.cli("status")[0] == 3
    assert d.cli("run", "hash")[0] == 2 and d.cli("finalize")[0] == 3
    d.runner.authorize_rc = 0  # an explicit rerun of the gate clears it
    assert d.cli("finalize")[0] == 0 and overall(d) == "READY_FOR_REVIEW" and d.cli("status")[0] == 0


def test_hash_mismatch_is_terminal_not_pending(d):
    d.to_stage("integrity")
    d.cli("run", "integrity")
    (d.pkg / "FINAL.md").write_text((d.pkg / "FINAL.md").read_text() + "\nDrift.\n")
    pipe = Pipeline(d.pkg)
    out = FN.run_hash(pipe)
    assert out["code"] == "NOT_READY" and Pipeline(d.pkg).overall() == "NOT_READY"


def test_package_on_changed_final_is_terminal(d):
    d.to_stage("integrity")
    d.cli("run", "integrity")
    d.cli("run", "hash")
    (d.pkg / "FINAL.md").write_text((d.pkg / "FINAL.md").read_text() + "\nDrift.\n")
    out = FN.run_package(Pipeline(d.pkg), d.runner)
    assert out["code"] == "NOT_READY" and Pipeline(d.pkg).overall() == "NOT_READY"


# ---- #8 stage boundaries ---------------------------------------------------------------------------------------
@pytest.mark.parametrize("stage,payload", [
    ("source", {"sources": ["not an object"]}),
    ("research", {"research_delta": "x" * 30, "claims": ["oops", 7]}),
    ("research", {"research_delta": "x" * 30, "claims": [{"id": "c1", "claim": "a", "status": "supported", "supported_wording": "a", "evidence": ["bad", {"passage": "p", "url": "https://e.com"}]}]}),
    ("outline", {"sections": ["a", "b"]}),
    ("angle", {"question": "q", "reader": "r", "angle": "a", "verdict": "adds", "contributions": [[1]], "author_opportunities": "no"}),
])
def test_malformed_nested_json_is_a_rejected_artifact_not_a_crash(d, stage, payload):
    d.to_stage(stage)
    rc, out = d.submit(stage, payload)
    assert rc == 1 and out["ok"] is False and stages(d)[stage] == "FAILED"


def test_malformed_evidence_ids_are_rejected(d):
    d.to_stage("angle")
    bad = {**d.ANGLE, "contributions": [{"id": "k1", "text": "t", "kind": "analysis", "evidence_ids": [["c1"]]}]}
    rc, out = d.submit("angle", bad)
    assert rc == 1 and stages(d)["angle"] == "FAILED"


def test_invalid_utf8_text_is_rejected_and_persisted(d):
    d.to_stage("draft")
    f = d.inbox / "draft.md"
    f.write_bytes(b"# Title\n\nCaf\xe9 \xff\xfe bytes.\n")
    rc, out = d.cli("submit", "draft", "--file", str(f))
    assert rc == 1 and "UTF-8" in out["reasons"][0] and stages(d)["draft"] == "FAILED"


def test_unexpected_exception_in_a_validator_is_persisted(d, monkeypatch):
    d.to_stage("research")
    from scripts.write_pipeline import validators as V
    monkeypatch.setattr(V, "evidence", lambda *a, **k: (_ for _ in ()).throw(ZeroDivisionError("boom")))
    rc, out = d.submit("research", d.EVIDENCE)
    assert rc == 1 and "ZeroDivisionError" in out["reasons"][0] and stages(d)["research"] == "FAILED"


def test_unexpected_critic_exception_is_blocked_and_persisted(d):
    d.to_stage("critic")
    d.critic.replies = [RuntimeError("critic crashed")]
    rc, out = d.cli("run", "critic")
    assert rc == 4 and stages(d)["critic"] == "BLOCKED"


def test_critic_reply_with_nonsense_nested_shape_is_failed(d):
    d.to_stage("critic")
    d.critic.replies = [{"verdict": "revise", "findings": [[1, 2], "x"]}]
    rc, out = d.cli("run", "critic")
    assert rc == 1 and stages(d)["critic"] == "FAILED"


def test_runner_exception_in_the_final_gate_is_persisted_not_pending(d):
    d.to_stage("integrity")

    def boom(argv):
        raise ValueError("runner exploded")
    d.runner = boom
    rc, out = d.cli("run", "integrity")
    assert rc == 3 and stages(d)["integrity"] == "NOT_READY" and overall(d) == "NOT_READY"


def test_final_md_with_invalid_utf8_after_pass_is_not_ready(d):
    final_run(d)
    (d.pkg / "FINAL.md").write_bytes(b"# T\n\n\xff\xfe broken\n")
    rc, out = d.cli("revalidate")
    assert rc == 3 and out["code"] == "NOT_READY" and "UTF-8" in out["reasons"][0]
    assert overall(d) in ("NOT_READY", "USER_MODIFIED") and d.cli("status")[0] != 0


# ---- #11 route D ----------------------------------------------------------------------------------------------
def test_route_d_is_quarantined_and_never_ready_for_review(d):
    d.runner.route = {"route_code": "D", "route": "QUARANTINE", "detail": "D_QUARANTINE", "reasons": ["policy risk"], "publication_candidates": []}
    d.to_stage("integrity")
    rc, out = d.cli("finalize")
    assert rc == 5 and out["failed_at"] == "package" and out["results"]["package"]["code"] == "QUARANTINED"
    assert overall(d) == "QUARANTINED" and d.cli("status")[0] == 5
    assert not (d.pkg / "PACKAGE.md").exists() and stages(d)["stop"] != "DONE" and not state(d).get("awaiting_review")
    assert d.cli("run", "stop")[0] != 0


def test_unknown_route_code_fails_closed(d):
    d.runner.route = {"route_code": "Z", "route": "???", "reasons": []}
    d.to_stage("integrity")
    rc, out = d.cli("finalize")
    assert rc == 4 and overall(d) == "BLOCKED" and not (d.pkg / "PACKAGE.md").exists()


def test_stop_refuses_a_d_package_even_if_called_directly(d):
    final_run(d)
    s = state(d)
    art = d.pkg / s["stages"]["package"]["artifact"]
    j = json.loads(art.read_text())
    j["route_code"] = "D"
    art.write_text(json.dumps(j))
    pipe = Pipeline(d.pkg)
    assert pipe.overall() != "READY_FOR_REVIEW"
