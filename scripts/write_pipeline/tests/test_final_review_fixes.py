"""Regressions for the final Codex review of the write path: user bytes, stale cuts, NOT_READY packages, one threshold contract, child env."""
import json
import re
import sys
from pathlib import Path

import pytest

from scripts.fingerprint_eval import gateway as GW
from scripts.write_pipeline import antifp as AF
from scripts.write_pipeline import authorprofile as PF
from scripts.write_pipeline import cuts as CT
from scripts.write_pipeline import editguard as G
from scripts.write_pipeline import final as FN
from scripts.write_pipeline import fpcaps as FC
from scripts.write_pipeline import fpcontract as CTR
from scripts.write_pipeline import fpv as FPV
from scripts.write_pipeline import runs as RN
from scripts.write_pipeline.core import Pipeline

from .fakes import sha
from .test_lifecycle import final_run, st
from .test_repair_adds import candidate, major_open, try_repair

CUT = "The report covers one workload on one fleet."


# ---- 1. user bytes are never overwritten ------------------------------------------------------------------------------
def test_finalize_never_overwrites_a_user_edit_after_pass(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    edited = p.read_text().replace("briefly", "in a few lines").encode()
    p.write_bytes(edited)
    auth = len(d.runner.authorize_seen)
    pipe = Pipeline(d.pkg)  # the library entry points, not the CLI guard
    r = FN.finalize(pipe, d.runner)
    assert r["failed_at"] == "integrity" and r["results"]["integrity"]["code"] == "USER_MODIFIED"
    assert p.read_bytes() == edited and len(d.runner.authorize_seen) == auth  # no write, and the gate never saw other bytes
    assert FN.run_integrity(Pipeline(d.pkg), d.runner)["code"] == "USER_MODIFIED" and p.read_bytes() == edited
    rc, out = d.cli("run", "integrity")
    assert rc == 6 and out["code"] == "USER_MODIFIED" and p.read_bytes() == edited
    assert st(d)["overall"] == "USER_MODIFIED"
    assert d.cli("revalidate")[0] == 0 and sha(p.read_bytes()) == st(d)["final"]["sha256"]  # only an explicit revalidate takes the edit


def test_user_edit_survives_a_half_finished_revalidate(d):
    """After 'revalidate' adopts the edit (final cleared), a second edit before the gate passes must still not be overwritten."""
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("briefly", "in a few lines"))
    pipe = Pipeline(d.pkg)
    FN.sync_user_edit(pipe)
    pipe.state["final"], pipe.state["final_written"] = None, sha(p.read_bytes())  # what revalidate records before it reruns the stages
    pipe.save()
    second = p.read_text().replace("in a few lines", "in two lines").encode()
    p.write_bytes(second)
    r = FN.run_integrity(Pipeline(d.pkg), d.runner)
    assert r["code"] == "USER_MODIFIED" and p.read_bytes() == second


# ---- 2. cuts, ledger entries and rebases are bound to the current reference and candidate -------------------------------
def _repair_with_cut(d):
    major_open(d)
    d.runner.required = ["covers one workload on one fleet"]
    rc, out = try_repair(d, candidate(d).replace(CUT + " ", ""), removals=[{"text": CUT, "reason": "restates the next paragraph"}])
    assert rc == 0, out
    p = Pipeline(d.pkg)
    assert RN.repair_cuts(p) and p.state["removals_ledger"] and all(e.get("reference_sha256") and e.get("candidate_sha256") for e in p.state["removals_ledger"])
    return p


def test_cuts_ledger_and_rebase_are_dropped_when_the_reference_is_reworked(d):
    p = _repair_with_cut(d)
    p.state["rebase"] = {"accepted": True, "path": "x", "new_reference_sha256": "a", "candidate_sha256": p.state["candidate"]["sha256"],
                         "raw_reference_sha256": CT.images_reference_sha(p)}
    assert CT.rebase_valid(p) and CT.prune(p) == []  # a consistent run loses nothing
    p.state["stages"]["images"]["reference_frame_sha256"] = "0" * 64  # an upstream rework produced a new reference frame
    dropped = CT.prune(p)
    assert dropped and RN.repair_cuts(p) == [] and p.state["removals_ledger"] == [] and not p.state["rebase"]
    assert CT.signed_removal_entries(d.pkg) == []  # the signed file was rewritten empty too: removals must be validated again


def test_cuts_do_not_survive_a_fresh_candidate_lineage(d):
    p = _repair_with_cut(d)
    p.state["candidate"] = {"path": p.state["candidate"]["path"], "sha256": "f" * 64, "origin": "frame"}  # a reworked candidate has no history
    assert RN.repair_cuts(p) == [] and not CT.repair_binding_ok(p)
    assert CT.prune(p) and p.state["removals_ledger"] == []


def test_stale_cut_cannot_hide_a_later_link_loss_at_the_final_gate(d):
    _repair_with_cut(d)
    d.critic.replies = [{"verdict": "pass", "findings": []}]
    d.cli("run", "critic")
    d.cli("repair", "done")
    d.cli("fpverify", "done")
    p = Pipeline(d.pkg)
    p.state["stages"]["images"]["reference_frame_sha256"] = "0" * 64
    p.save()
    rc, out = d.cli("run", "integrity")
    assert rc != 0  # no signed removal survives the rework: nothing is allowed to disappear on the strength of the old ledger
    assert st(d)["overall"] != "READY_FOR_REVIEW"


def test_accepted_rebase_does_not_skip_the_raw_link_check(d):
    final_run(d)
    p = d.pkg / "FINAL.md"
    p.write_text(p.read_text().replace("[test report](https://example.com/lab-report)", "test report"))
    assert d.cli("revalidate")[0] == 3  # the guard sees the lost link
    rc, out = d.cli("rebase", "--reason", "author wants the link gone")
    assert rc == 0, out  # the stub claims gate does not see the link
    rc, out = d.cli("finalize")
    assert rc != 0 and any("link" in r for r in out["results"]["integrity"]["reasons"]), out
    assert st(d)["overall"] != "READY_FOR_REVIEW"


# ---- 3. every NOT_READY return writes FINAL.md, FINAL.html and PACKAGE.md ------------------------------------------------
def _corrupt(d):
    (d.pkg / "write-pipeline/state.json").write_text("{not json")


@pytest.mark.parametrize("cmd", [("status", "--json"), ("next",), ("finalize",), ("run", "critic")])
def test_invalid_state_still_writes_the_three_files_from_the_best_candidate(d, cmd):
    d.to_stage("critic")
    cand = candidate(d)
    _corrupt(d)
    rc, out = d.cli(*cmd)
    assert rc == 3
    for n in ("FINAL.md", "FINAL.html", "PACKAGE.md"):
        assert (d.pkg / n).exists(), n
    final, pkg = (d.pkg / "FINAL.md").read_text(), (d.pkg / "PACKAGE.md").read_text()
    assert "NOT READY" in final and "state invalid" in final and "invalid" in pkg.lower() and "NOT_READY" in pkg
    assert "NOT READY" in (d.pkg / "FINAL.html").read_text()
    assert cand.strip().splitlines()[-1] in final  # the article text recovered from disk


def test_invalid_state_with_no_candidate_says_so_in_package_md(d):
    assert d.cli("init")[0] == 0
    _corrupt(d)
    assert d.cli("next")[0] == 3
    for n in ("FINAL.md", "FINAL.html", "PACKAGE.md"):
        assert (d.pkg / n).exists(), n
    assert "no candidate article exists on disk" in (d.pkg / "PACKAGE.md").read_text()


def test_invalid_state_keeps_the_final_bytes_that_exist_and_replaces_a_stale_ready_package(d):
    final_run(d)
    before = (d.pkg / "FINAL.md").read_bytes()
    _corrupt(d)
    assert d.cli("finalize")[0] == 3
    assert (d.pkg / "FINAL.md").read_bytes() == before
    assert "invalid" in (d.pkg / "PACKAGE.md").read_text().lower() and "NOT_READY" in (d.pkg / "PACKAGE.md").read_text()


def test_malformed_framework_record_writes_the_three_files(d):
    d.to_stage("critic")
    p = d.pkg / "write-pipeline/state.json"
    s = json.loads(p.read_text())
    s["framework"] = {"sha256": "x"}  # signature breaks: state invalid via the framework path as well
    p.write_text(json.dumps(s))
    assert d.cli("status", "--json")[0] == 3
    assert all((d.pkg / n).exists() for n in ("FINAL.md", "FINAL.html", "PACKAGE.md"))


# ---- 4. one threshold and signal contract ------------------------------------------------------------------------------
def test_generation_antifp_and_fpverify_share_one_contract():
    assert AF.signals is CTR.signals and AF.WEIGHTS is CTR.WEIGHTS and AF.HEAVY_COMPOSITE == CTR.HEAVY_COMPOSITE and AF.HEAVY_TEMPLATE_HITS == CTR.HEAVY_TEMPLATE_HITS
    assert FC.caps is CTR.caps and FC.violations is CTR.violations
    assert PF.ABSOLUTE["template_hits"] == CTR.caps()["template_hits"] and PF.ABSOLUTE["em_dash"] == CTR.EM_DASH_REPORT_FLOOR
    src = "".join(Path(sys.modules[m].__file__).read_text() for m in ("scripts.write_pipeline.fpcaps", "scripts.write_pipeline.antifp", "scripts.write_pipeline.fpv"))
    assert not re.search(r"^(HEAVY_\w+|WEIGHTS|TRANSITION_FLOOR|ONE_SENTENCE_PARA_FLOOR|COMPOSITE_MARGIN)\s*=", src, re.M)  # defined once, in fpcontract


HEAVY = ("This isn't a rewrite, it's a rebuild. This isn't a fix, it's a reset. This isn't speed, it's focus. This isn't hype, it's math. "
         "Here is the thing: it works. Here's the thing: it scales.")


def test_heavy_text_is_heavy_for_antifp_and_unacceptable_to_fpverify(d, monkeypatch):
    sig = CTR.signals(HEAVY)
    assert CTR.is_heavy(sig) and CTR.assess(HEAVY)["heavy"]
    assert CTR.violations(sig, CTR.caps())  # the generation caps reject it too
    d.to_stage("fpverify")
    p = Pipeline(d.pkg)
    orig = CTR.assess
    monkeypatch.setattr(FPV.CT, "assess", lambda text, has_debt=False, cap=None: orig(HEAVY, has_debt, cap))  # fpverify measures a heavy text
    r = FPV.finish(p)
    assert r["ok"] is False and r["code"] == "NOT_READY" and "contract" in r["reasons"][0]
    assert p.status("fpverify") == "NOT_READY"


def test_fpverify_enforces_the_caps_when_a_stage_carries_fingerprint_debt(d, monkeypatch):
    clean = CTR.assess("A short plain sentence about nodes. Another one follows it here.", True)
    assert not clean["heavy"] and clean["owed"] == []
    d.to_stage("fpverify")
    p = Pipeline(d.pkg)
    p.state["stages"]["draft"]["fingerprint_debt"] = {"violations": []}
    orig = CTR.assess
    monkeypatch.setattr(FPV.CT, "assess", lambda text, has_debt=False, cap=None: orig(HEAVY, has_debt, cap))  # fpverify measures a heavy text
    assert FPV.finish(p)["code"] == "NOT_READY"


# ---- 5. child environments --------------------------------------------------------------------------------------------
ALL = {"PATH": "/bin", "HOME": "/h", "LLM_GATEWAY_API_KEY": "gw", "LLM_GATEWAY_URL": "https://gw", "CLAUDE_CODE_OAUTH_TOKEN": "oauth", "DOPPLER_TOKEN": "dp",
       "ANTHROPIC_API_KEY": "a", "OPENAI_API_KEY": "o", "GITHUB_TOKEN": "g", "SSL_CERT_FILE": "/c"}
SECRET = {"LLM_GATEWAY_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "DOPPLER_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN"}
POLICY = {  # module -> (gets the OAuth token, gets the gateway key)
    "scripts.fingerprint_eval.run": (True, True), "scripts.fingerprint_eval.release": (True, True), "scripts.write_pipeline.gaterun": (True, True),
    "scripts.medium_review": (True, False), "scripts.publish_route": (False, False),
}


def _call_site_modules() -> set[str]:
    base = Path(G.__file__).parent
    mods = set()
    for f in base.glob("*.py"):
        mods |= set(re.findall(r'"(scripts\.[a-z_]+(?:\.[a-z_]+)*)"', f.read_text()))
    return {m for m in mods if m.split(".")[1] in ("fingerprint_eval", "medium_review", "publish_route", "write_pipeline") and m.count(".") >= 1
            and m not in ("scripts.write_pipeline", "scripts.fingerprint_eval", "scripts.fingerprint_eval.contracts")
            and not m.startswith(("scripts.fingerprint_eval.gateway", "scripts.fingerprint_eval.guards", "scripts.fingerprint_eval.textutil"))}


def test_every_runner_call_site_module_has_an_explicit_env_policy():
    called = {m for m in _call_site_modules() if m in POLICY or m.rsplit(".", 1)[0] == "scripts" or m.endswith((".run", ".release", ".gaterun", ".medium_review", ".publish_route"))}
    assert {"scripts.fingerprint_eval.release", "scripts.medium_review", "scripts.publish_route"} <= called
    for m in sorted(called):
        argv = [sys.executable, "-m", m, "x"]
        env = G.runner_env(ALL, argv)
        oauth, gw = POLICY[m]  # a module not listed in POLICY fails here: classify it before it can launch
        assert ("CLAUDE_CODE_OAUTH_TOKEN" in env) is oauth, m
        assert ("LLM_GATEWAY_API_KEY" in env) is gw, m
        assert not ({"DOPPLER_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN"} & set(env)), m


def test_unknown_children_get_a_non_secret_env():
    for argv in ([sys.executable, "-m", "scripts.something_else", "x"], ["true"], None):
        env = G.runner_env(ALL, argv)
        assert not (SECRET & set(env)), argv
        assert env["PATH"] == "/bin"


def test_make_runner_passes_the_policy_env_to_subprocess(monkeypatch, tmp_path):
    import subprocess
    for k, v in ALL.items():
        monkeypatch.setenv(k, v)
    seen = {}
    monkeypatch.setattr(subprocess, "run", lambda argv, **kw: seen.update(env=kw["env"]) or subprocess.CompletedProcess(argv, 0, "", ""))
    run = G.make_runner(tmp_path)
    run([sys.executable, "-m", "scripts.publish_route", "decide"])
    assert not (SECRET & set(seen["env"]))
    run([sys.executable, "-m", "scripts.fingerprint_eval.release", "authorize"])
    assert seen["env"]["LLM_GATEWAY_API_KEY"] == "gw" and seen["env"]["CLAUDE_CODE_OAUTH_TOKEN"] == "oauth"


def test_gateway_claude_env_is_the_only_oauth_door():
    assert GW.claude_env(ALL)["CLAUDE_CODE_OAUTH_TOKEN"] == "oauth" and "LLM_GATEWAY_API_KEY" not in GW.claude_env(ALL)
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in GW.plain_env(ALL) and "CLAUDE_CODE_OAUTH_TOKEN" not in GW.codex_env(ALL)
