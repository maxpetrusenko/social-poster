"""Codex re-check fixes: gate child env, signed state, recomputed final verification, input containment, malformed data."""
import json
import subprocess
import sys

import pytest

from scripts.fingerprint_eval import record as R
from scripts.write_pipeline import editguard as G
from scripts.write_pipeline.core import Pipeline
from scripts.write_pipeline.verify import final_failures

from .fakes import GATE_REC, resign_state, sha

ROUTE = "evals/publish-route/route.json"


def ready(d):
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    return d.cli("status", "--json")[1]


def overall(d):
    return d.cli("status", "--json")[1]["overall"]


# ---- 1. runner env ---------------------------------------------------------------------------------------------------
def test_gate_child_gets_the_gateway_key_and_other_children_do_not(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_GATEWAY_API_KEY", "gw-secret")
    monkeypatch.setenv("LLM_GATEWAY_URL", "https://gw.example")
    monkeypatch.setenv("DOPPLER_TOKEN", "dp-secret")
    seen = []
    monkeypatch.setattr(subprocess, "run", lambda argv, **kw: (seen.append((argv, kw["env"])), subprocess.CompletedProcess(argv, 0, "", ""))[1])
    run = G.make_runner(tmp_path)
    for mod in ("scripts.fingerprint_eval.run", "scripts.fingerprint_eval.release"):
        run([sys.executable, "-m", mod, "x"])
    run([sys.executable, "-m", "scripts.medium_review", "review"])
    run([sys.executable, "-m", "scripts.publish_route", "decide"])
    gate, claude = [e for _, e in seen[:2]], [e for _, e in seen[2:]]
    assert all(e["LLM_GATEWAY_API_KEY"] == "gw-secret" and e["LLM_GATEWAY_URL"] == "https://gw.example" for e in gate)
    assert all("LLM_GATEWAY_API_KEY" not in e for e in claude) and all("DOPPLER_TOKEN" not in e for e in gate + claude)
    assert G.runner_env(argv=[sys.executable, "-m", "claude"]).get("LLM_GATEWAY_API_KEY") is None


# ---- 2. forged state -------------------------------------------------------------------------------------------------
def test_honest_run_is_ready_and_state_is_signed(d):
    assert ready(d)["overall"] == "READY_FOR_REVIEW"
    s = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    assert R.SIG_FIELD in s and all(R.SIG_FIELD in r for r in s["stages"].values())


def test_hand_edited_state_is_never_ready(d):
    ready(d)
    p = d.pkg / "write-pipeline/state.json"
    s = json.loads(p.read_text())
    s["stages"]["package"]["reasons"] = ["edited"]
    p.write_text(json.dumps(s))
    rc, out = d.cli("status", "--json")
    assert rc == 3 and out["overall"] == "NOT_READY" and out["invalid"] and out["awaiting_review"] is False
    assert any(x.name.startswith("state.json.invalid-") for x in (d.pkg / "write-pipeline").iterdir())  # kept aside, not deleted
    assert json.loads(p.read_text())["invalid"]  # the NOT_READY verdict is persisted
    assert d.cli("finalize")[0] == 3


def test_unsigned_state_is_never_ready(d):
    ready(d)
    p = d.pkg / "write-pipeline/state.json"
    s = json.loads(p.read_text())
    del s[R.SIG_FIELD]
    p.write_text(json.dumps(s))
    assert overall(d) == "NOT_READY"


def test_forged_done_records_cannot_report_ready(d):
    """A package writer fabricates DONE stage records and a route artifact on a package that never ran the gate."""
    d.to_stage("integrity")
    final = (d.pkg / "write-pipeline/artifacts")  # exists; the forger copies a candidate into FINAL.md
    p = d.pkg / "write-pipeline/state.json"
    s = json.loads(p.read_text())
    for n in ("integrity", "hash", "package", "stop"):
        s["stages"][n] = {"status": "DONE", "inputs": {}, "bundle_sha256": "f" * 64, "artifact": None, "files": {}, "reasons": [], "attempts": 1}
    s["final"] = {"sha256": "f" * 64, "path": "FINAL.md"}
    p.write_text(json.dumps(s))
    assert final.exists() and overall(d) == "NOT_READY"


def test_forged_records_with_the_key_still_fail_recomputation(d):
    """Even a validly re-signed state is not enough: the gate record, route and outputs are recomputed from the files."""
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    (d.pkg / GATE_REC).unlink()  # no signed gate record exists for these bytes
    assert overall(d) == "NOT_READY"


def test_forged_gate_record_unsigned_or_other_bytes(d):
    ready(d)
    (d.pkg / GATE_REC).write_text(json.dumps({"result": "PASS", "content_sha256": sha((d.pkg / "FINAL.md").read_bytes())}))  # unsigned
    assert overall(d) == "NOT_READY"
    (d.pkg / GATE_REC).write_text(json.dumps(R.signed({"result": "PASS", "content_sha256": "0" * 64})))  # signed, other bytes
    assert overall(d) == "NOT_READY"
    (d.pkg / GATE_REC).write_text(json.dumps(R.signed({"result": "FAIL", "content_sha256": sha((d.pkg / "FINAL.md").read_bytes())})))
    assert overall(d) == "NOT_READY"


def test_forged_route_artifact_is_not_ready(d):
    from scripts.publish_route.orchestrate import _canon
    ready(d)
    rp = d.pkg / ROUTE
    rec = json.loads(rp.read_text())
    rec["route_code"] = "A"
    rec["route"] = "FORGED"
    rp.write_text(json.dumps(rec))  # self hash now wrong
    assert overall(d) in ("NOT_READY", "IN_PROGRESS")
    rec["route_sha256"] = sha(_canon(rec))  # self hash repaired: the package record's hash of route.json still disagrees
    rp.write_text(json.dumps(rec, indent=2, sort_keys=True))
    assert overall(d) != "READY_FOR_REVIEW"
    rec["binding"] = {"content_sha256": "1" * 64}
    rec["route_sha256"] = sha(_canon(rec))
    rp.write_text(json.dumps(rec))
    assert overall(d) != "READY_FOR_REVIEW"
    pipe = Pipeline(d.pkg)
    assert any("route" in x for x in final_failures(pipe, d.runner))


def test_run_stop_recomputes_and_refuses_a_forged_gate_record(d):
    d.to_stage("integrity")
    assert d.cli("run", "integrity")[0] == 0 and d.cli("run", "hash")[0] == 0 and d.cli("run", "package")[0] == 0
    (d.pkg / GATE_REC).write_text("{}")
    rc, out = d.cli("run", "stop")
    assert rc == 3 and out["code"] == "NOT_READY" and "signed gate record" in out["reasons"][0]
    assert overall(d) == "NOT_READY"


def test_tampered_package_outputs_are_not_ready(d):
    ready(d)
    html = d.pkg / "FINAL.html"
    html.write_text(html.read_text() + "<!-- x -->")
    assert overall(d) != "READY_FOR_REVIEW"
    assert any("FINAL.html" in x for x in final_failures(Pipeline(d.pkg), d.runner))


# ---- 5. package hashes tracked in the stage record, re-hashed on status ----------------------------------------------
def test_package_record_tracks_output_hashes_and_status_rehashes(d):
    ready(d)
    rec = json.loads((d.pkg / "write-pipeline/state.json").read_text())["stages"]["package"]
    assert {"FINAL.md", "FINAL.html", "PACKAGE.md", ROUTE} <= set(rec["files"]) and all(rec["files"].values())
    pm = d.pkg / "PACKAGE.md"
    pm.write_text(pm.read_text() + "\nedited\n")
    stage = {r["stage"]: r["state"] for r in d.cli("status", "--json")[1]["stages"]}
    assert stage["package"] == "STALE" and overall(d) != "READY_FOR_REVIEW"


# ---- 3. input containment --------------------------------------------------------------------------------------------
def test_inputs_outside_the_package_and_roots_are_refused(d, tmp_path, monkeypatch):
    d.to_stage("research")
    monkeypatch.setenv("WRITE_PIPELINE_INPUT_ROOTS", str(d.tmp / "inbox"))
    monkeypatch.setenv("WRITE_PIPELINE_FRAMEWORK", str(d.fw))
    outside = tmp_path.parent / f"outside-{tmp_path.name}.json"
    outside.write_text(json.dumps(d.sources()))
    rc, out = d.cli("submit", "research", "--file", str(outside))
    assert rc == 2 and "outside the package" in out["reasons"][0]
    rc, out = d.cli("submit", "research", "--file", str(d.write("ok.json", d.EVIDENCE)), "--report", str(outside))
    assert rc == 2 and "outside the package" in out["reasons"][0]


def test_escaping_symlink_is_refused_and_inside_link_is_allowed(d, tmp_path, monkeypatch):
    d.to_stage("research")
    outside = tmp_path.parent / f"outside-{tmp_path.name}.md"
    outside.write_text("# x\n")
    (d.pkg / "link.md").symlink_to(outside)
    monkeypatch.setenv("WRITE_PIPELINE_INPUT_ROOTS", str(d.tmp / "inbox"))
    monkeypatch.setenv("WRITE_PIPELINE_FRAMEWORK", str(d.fw))
    rc, out = d.cli("submit", "research", "--file", str(d.pkg / "link.md"))
    assert rc == 2 and "outside the package" in out["reasons"][0]
    rc, out = d.cli("repair", "try", "--file", str(d.pkg / "link.md"))
    assert rc == 2 and out["code"] == "USAGE" and "outside the package" in out["reasons"][0]
    inner = d.pkg / "inner.json"
    inner.write_text(json.dumps(d.EVIDENCE))
    (d.pkg / "ok-link.json").symlink_to(inner)
    rc, out = d.cli("submit", "research", "--file", str(d.pkg / "ok-link.json"))
    assert "outside the package" not in json.dumps(out)


def test_framework_outside_allowlist_or_via_escaping_symlink_is_refused(d, tmp_path, monkeypatch):
    monkeypatch.setenv("WRITE_PIPELINE_INPUT_ROOTS", str(d.tmp / "nowhere"))
    monkeypatch.delenv("WRITE_PIPELINE_FRAMEWORK", raising=False)
    rc, out = d.cli("init")
    assert rc == 4 and out["state"] == "BLOCKED_FRAMEWORK" and "outside the package" in out["reasons"][0]
    monkeypatch.setenv("WRITE_PIPELINE_INPUT_ROOTS", str(d.tmp))
    assert d.cli("init")[0] == 0
    monkeypatch.setenv("WRITE_PIPELINE_INPUT_ROOTS", str(d.tmp / "nowhere"))  # the recorded framework path is re-checked on every command
    rc, out = d.cli("next")
    assert rc == 4 and out["state"] == "BLOCKED_FRAMEWORK"


# ---- 4. malformed state or framework data persists NOT_READY ---------------------------------------------------------
@pytest.mark.parametrize("junk", ["{not json", "[]", json.dumps({"stages": []}), json.dumps({"stages": {"nope": {"status": "DONE"}}})])
def test_malformed_state_is_persisted_not_ready(d, junk):
    assert d.cli("init")[0] == 0
    (d.pkg / "write-pipeline/state.json").write_text(junk)
    rc, out = d.cli("next")
    assert rc == 3 and out["code"] == "NOT_READY"
    assert json.loads((d.pkg / "write-pipeline/state.json").read_text())["invalid"]
    rc, out = d.cli("status", "--json")
    assert rc == 3 and out["overall"] == "NOT_READY"


def test_malformed_framework_record_is_persisted_not_ready(d):
    assert d.cli("init")[0] == 0
    resign_state(d.pkg, lambda s: s.__setitem__("framework", {"path": 7, "sha256": None}))
    rc, out = d.cli("next")
    assert rc == 3 and out["code"] == "NOT_READY"
    assert json.loads((d.pkg / "write-pipeline/state.json").read_text())["invalid"]["reason"].startswith("framework")


def test_non_utf8_framework_is_persisted_not_ready(d):
    assert d.cli("init")[0] == 0
    d.fw.write_bytes(b"\xff\xfe\x00bad")
    rc, out = d.cli("next")
    assert rc == 3 and out["code"] == "NOT_READY"
    assert json.loads((d.pkg / "write-pipeline/state.json").read_text())["invalid"]


# ---- A. declared editorial cuts ---------------------------------------------------------------------------------------
CUT = "The team has not published tail latency, so the median alone cannot say whether the slowest requests improved."
REP = {"unslop": {"applied": True, "prose_checker": "ran"}}


def _cut_text():
    from .fakes import EDITORIAL
    assert CUT in EDITORIAL
    return EDITORIAL.replace(" " + CUT, "")


def test_declared_editorial_cut_is_accepted_and_ledgered(d):
    d.to_stage("editorial")
    d.runner.required = [CUT]
    rc, out = d.submit("editorial", _cut_text(), report={**REP, "removals": [{"text": CUT, "reason": "speculative aside"}]})
    assert rc == 0, out
    ref = (d.pkg / "write-pipeline/work/editorial/reference/reference.md").read_text()
    assert CUT not in ref  # the gate compared against the reference minus the declared cut, and still judged the rest
    s = json.loads((d.pkg / "write-pipeline/state.json").read_text())
    (e,) = s["removals_ledger"]
    assert e["stage"] == "editorial" and e["sentence_sha256"] == sha(CUT.encode()) and e["reason"] == "speculative aside"
    led = json.loads((d.pkg / "write-pipeline/removals-ledger.json").read_text())
    R.check_signature(led, "ledger")
    led["entries"][0]["reason"] = "x"
    with pytest.raises(R.RecordError):
        R.check_signature(led, "ledger")


def test_undeclared_or_inexact_cut_still_blocks(d):
    d.to_stage("editorial")
    d.runner.required = [CUT]
    assert d.submit("editorial", _cut_text(), report=REP)[0] == 1
    inexact = {**REP, "removals": [{"text": CUT.replace("tail latency", "tail latencies"), "reason": "x"}]}
    rc, out = d.submit("editorial", _cut_text(), report=inexact)
    assert rc == 1 and "changed meaning" in out["reasons"][0]
    assert not json.loads((d.pkg / "write-pipeline/state.json").read_text()).get("removals_ledger")


def test_changed_claim_blocks_even_when_a_cut_is_declared(d):
    d.to_stage("editorial")
    d.runner.required = [CUT]
    d.runner.forbidden = ["to the network"]
    rc, out = d.submit("editorial", _cut_text().replace("to the cache", "to the network"), report={**REP, "removals": [{"text": CUT, "reason": "aside"}]})
    assert rc == 1 and "changed meaning" in out["reasons"][0]


def test_declared_cut_flows_to_the_final_gate_reference(d):
    d.to_stage("editorial")
    assert d.submit("editorial", _cut_text(), report={**REP, "removals": [{"text": CUT, "reason": "aside"}]})[0] == 0
    d.texts["voice"] = _cut_text().replace("A reader with a different request mix should rerun", "Anyone with a different request mix should rerun")
    d.to_stage("integrity")
    assert d.cli("finalize")[0] == 0
    assert CUT not in (d.pkg / "FINAL.md").read_text()


# ---- B. unresolved-claims semantic check is not vacuous ---------------------------------------------------------------
def test_unresolved_reference_matches_the_candidate_structure():
    from scripts.fingerprint_eval.guards import frozen_diff, structure_preservation
    from scripts.write_pipeline import validators as V
    from .fakes import DRAFT, Driver
    ref = V.unresolved_reference(Driver.EVIDENCE, DRAFT)
    st = structure_preservation(ref, DRAFT)
    assert st["headings"]["preserved"] and st["codes"]["preserved"] and st["images"]["preserved"] and not frozen_diff(ref, DRAFT)
    assert "hosting costs" in ref  # the unresolved claim itself is the only prose


def test_structural_fail_on_the_unresolved_check_is_inconclusive(d):
    d.to_stage("validate")
    d.runner.unresolved_cats = ["STRUCTURAL_DAMAGE"]
    rc, out = d.submit("validate", d.texts["validate"], report=d.FACTUAL)
    assert rc == 3 and out["code"] == "NOT_READY" and "inconclusive" in out["reasons"][0]
    stage = {r["stage"]: r["state"] for r in d.cli("status", "--json")[1]["stages"]}
    assert stage["validate"] == "NOT_READY"
    d.runner.unresolved_cats = ["CONTENT_CLAIM_FAILURE"]  # a claims-only FAIL is the clean result
    assert d.submit("validate", d.texts["validate"], report=d.FACTUAL)[0] == 0
