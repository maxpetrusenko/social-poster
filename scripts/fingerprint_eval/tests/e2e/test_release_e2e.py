"""End-to-end failure injection for the release gate. Drives the public interfaces only: the
`release authorize|verify|status` CLI (contracts.py "release CLI") and heal.run_heal_loop with a custom
Repairer. Models are faked (fakes.py); everything else is the real code path.

While W1 (release/authz) and W2 (heal/repair/circuit) are unmerged the module guard marks every test
xfail (not run). Once the modules import, the marks drop and the suite must be green.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from scripts.fingerprint_eval.tests.e2e import harness as H
from scripts.fingerprint_eval.tests.e2e import injectors as inj
from scripts.fingerprint_eval.tests.e2e.fakes import FAULT_KINDS, Fault, FakeModels

MISSING = H.missing_modules()
pytestmark = pytest.mark.xfail(bool(MISSING), strict=False, run=False,
                               reason=f"awaiting W1/W2: scripts.fingerprint_eval modules not merged yet: {MISSING}")

CONTENT = {"CONTENT_CLAIM_FAILURE", "ADDED_UNSUPPORTED_CLAIM", "MISSING_LINK", "STRUCTURAL_DAMAGE", "MISSING_SOURCE"}
INFRA = {"STALE_EVALUATION", "MODEL_TIMEOUT", "MODEL_UNAVAILABLE", "GATEWAY_FAILURE", "MALFORMED_MODEL_OUTPUT",
         "DEPENDENCY_FAILURE", "UNKNOWN_ERROR"}


@pytest.fixture(autouse=True)
def isolated_circuits():
    """The circuit file lives in the shared workspace; keep scenarios from leaking breaker state."""
    saved = H.circuits_snapshot()
    H.reset_circuits(None)
    yield
    H.reset_circuits(saved)


@pytest.fixture
def pkg(tmp_path):
    return H.make_package(tmp_path)


def mutate(pkg: Path, fn) -> str:
    f = H.final_file(pkg)
    f.write_text(fn(f.read_text()))
    return H.sha(f.read_bytes())


def assert_authorized(pkg: Path, *, original_final: Path | None = None):
    final = H.final_file(pkg)
    rel = pkg / "release/medium-final.md"
    assert rel.exists() and (pkg / "release/authorization.json").exists()
    assert rel.read_bytes() == final.read_bytes()
    assert H.auth_hash(pkg) == H.sha(final.read_bytes())
    assert "PUBLISH_AUTHORIZED" in H.states(pkg)
    assert not (pkg / "QUARANTINE.json").exists()
    assert H.verify(pkg).code == 0


def assert_no_release(pkg: Path):
    assert H.release_files(pkg) == []
    assert "PUBLISH_AUTHORIZED" not in H.states(pkg)
    assert H.verify(pkg).code == 1


# 1 ----------------------------------------------------------------------------------------------------
def test_01_clean_article_passes_and_is_authorized(pkg):
    h0 = H.sha((pkg / "article-medium.md").read_bytes())
    with FakeModels() as fm:
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert H.auth_hash(pkg) == h0
    assert_authorized(pkg)
    assert H.cycles(pkg) == []  # no healing needed
    assert fm.faults_fired == []
    assert (pkg / "evals/fingerprint-gate/SUMMARY.md").exists()
    assert len(H.runs(pkg)) == 1
    assert {"GATE_REQUESTED", "GATE_EXECUTED", "RESULT_VALID", "RESULT_MATCHES_CONTENT", "PUBLISH_AUTHORIZED"} <= set(H.states(pkg))


# 2 ----------------------------------------------------------------------------------------------------
def test_02_missing_link_is_healed_to_a_new_hash_and_passes(pkg):
    h0 = mutate(pkg, inj.remove_one_link)
    broken_bytes = (pkg / "article-medium.md").read_bytes()
    with FakeModels():
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert_authorized(pkg)
    assert H.auth_hash(pkg) != h0                                  # repair => new content hash
    assert (pkg / "article-medium.md").read_bytes() == broken_bytes  # earlier versions never overwritten
    healed = H.final_file(pkg)
    assert healed.name.startswith("article-healed-")
    assert "MISSING_LINK" in H.categories(pkg) or "STRUCTURAL_DAMAGE" in H.categories(pkg)
    assert H.kinds(pkg) == {"content"}
    assert set(H.categories(pkg)) <= CONTENT
    assert len(H.runs(pkg)) >= 2                                   # failing run kept, plus the passing re-run


# 3 ----------------------------------------------------------------------------------------------------
def test_03_altered_claim_is_restored_from_reference(pkg):
    h0 = mutate(pkg, inj.alter_claim)
    with FakeModels():
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert_authorized(pkg)
    assert H.auth_hash(pkg) != h0
    released = (pkg / "release/medium-final.md").read_text()
    assert inj.ALTER_FROM in released and inj.ALTER_TO not in released
    assert H.kinds(pkg) == {"content"} and "CONTENT_CLAIM_FAILURE" in H.categories(pkg)


# 4 ----------------------------------------------------------------------------------------------------
def test_04_deleted_section_is_restored(pkg):
    h0 = mutate(pkg, inj.delete_section)
    with FakeModels():
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert_authorized(pkg)
    assert H.auth_hash(pkg) != h0
    assert inj.DELETE_HEADING in (pkg / "release/medium-final.md").read_text()
    assert H.kinds(pkg) == {"content"} and set(H.categories(pkg)) <= CONTENT


# 5 ----------------------------------------------------------------------------------------------------
def test_05_stale_pass_fails_verify_and_authorize_reruns(pkg):
    with FakeModels():
        assert H.authorize(pkg).code == 0
    first_hash, first_runs = H.auth_hash(pkg), H.runs(pkg)
    first_run_bytes = {p.name: p.read_bytes() for p in first_runs}
    assert H.verify(pkg).code == 0

    inj.modify_after_pass(H.final_file(pkg))                       # touched after PASS
    v = H.verify(pkg)
    assert v.code == 1, v.out
    st = H.status(pkg)
    assert st.code == 0
    assert json.loads(st.out[st.out.index("{"):])                  # status stays machine readable

    with FakeModels():
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert H.auth_hash(pkg) != first_hash
    assert H.auth_hash(pkg) == H.sha(H.final_file(pkg).read_bytes())
    assert H.states(pkg).count("PUBLISH_AUTHORIZED") == 2
    assert len(H.runs(pkg)) > len(first_runs)
    for p in first_runs:                                           # records are immutable
        assert p.read_bytes() == first_run_bytes[p.name]
    assert H.verify(pkg).code == 0


# 6 ----------------------------------------------------------------------------------------------------
def test_06_evaluator_timeout_retries_and_passes_on_identical_bytes(pkg):
    before = (pkg / "article-medium.md").read_bytes()
    with FakeModels([Fault("*", "timeout", times=2)]) as fm:
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert len(fm.faults_fired) == 2 and fm.sleeps                 # it really failed, and backed off
    assert (pkg / "article-medium.md").read_bytes() == before      # infra recovery never touches bytes
    assert H.auth_hash(pkg) == H.sha(before)
    assert not list(pkg.glob("article-healed-*.md"))
    assert_authorized(pkg)
    assert H.kinds(pkg) <= {"infra"}
    assert set(H.categories(pkg)) <= INFRA
    for c in H.cycles(pkg):
        assert c["input_sha256"] == c["output_sha256"]


# 7 ----------------------------------------------------------------------------------------------------
def test_07_persistent_gateway_outage_opens_circuit_and_infra_quarantines(pkg):
    before = (pkg / "article-medium.md").read_bytes()
    with FakeModels([Fault("chat", "refused", times=None), Fault("embed", "refused", times=None)]) as fm:
        r = H.authorize(pkg)
    assert r.code == 4, r.out
    assert H.release_files(pkg) == []
    q = json.loads((pkg / "QUARANTINE.json").read_text())
    assert "NEEDS_REVIEW" in json.dumps(q)
    assert set(H.categories(pkg)) <= INFRA and H.kinds(pkg) <= {"infra"}
    assert (pkg / "article-medium.md").read_bytes() == before
    assert not list(pkg.glob("article-healed-*.md"))
    assert H.WORKSPACE_CIRCUITS.exists()                           # breaker state persisted
    assert H.verify(pkg).code == 1
    n_embed = fm.calls["embed"]
    # circuit is open: a second package does not hammer the dead dependency
    with FakeModels([Fault("embed", "refused", times=None)]) as fm2:
        H.authorize(H.make_package(pkg.parent, "pkg-b"))
    assert fm2.calls["embed"] <= n_embed


# 8 ----------------------------------------------------------------------------------------------------
def test_08_malformed_model_output_retries_then_falls_back_and_passes(pkg):
    before = (pkg / "article-medium.md").read_bytes()
    with FakeModels([Fault("claude_cli", "malformed", times=None)]) as fm:
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert fm.faults_fired and all(k == "malformed" for _, k in fm.faults_fired)
    assert any("qwen3" in m for m in fm.models_used)               # approved fallback actually used
    assert (pkg / "article-medium.md").read_bytes() == before
    assert_authorized(pkg)
    assert H.kinds(pkg) <= {"infra"}


# 9 ----------------------------------------------------------------------------------------------------
def test_09_unsupported_claim_without_reference_support_needs_review(pkg):
    mutate(pkg, inj.add_unsupported_section)
    with FakeModels():
        r = H.authorize(pkg)
    assert r.code == 3, r.out
    assert H.release_files(pkg) == []
    q = json.loads((pkg / "QUARANTINE.json").read_text())
    assert q.get("status") == "NEEDS_REVIEW"
    assert "PUBLISH_AUTHORIZED" not in H.states(pkg)
    assert "QUARANTINED" in H.states(pkg)
    assert H.verify(pkg).code == 1
    assert "ADDED_UNSUPPORTED_CLAIM" in json.dumps(q) or "NEEDS_REVIEW" in json.dumps(q)
    assert H.kinds(pkg) <= {"content"}


# 10 ---------------------------------------------------------------------------------------------------
class FaultyRepairer:
    """Conforms to the Repairer protocol but makes things worse: strips every link and a whole section."""
    def __init__(self):
        self.calls = 0

    def __call__(self, ctx, candidate: Path, record, cycle: int) -> Path | None:
        self.calls += 1
        out = ctx.package / f"article-healed-{cycle}.md"
        out.write_text(inj.damage_more(candidate.read_text()))
        return out


def test_10_a_repair_that_makes_it_worse_is_rejected_and_never_authorized(pkg):
    from scripts.fingerprint_eval import authz, heal
    from scripts.fingerprint_eval.contracts import MAX_REPAIR_CYCLES, Result

    mutate(pkg, inj.remove_one_link)
    rep = FaultyRepairer()
    with FakeModels():
        ctx = authz.resolve_package(pkg)
        outcome = heal.run_heal_loop(ctx, authz.evaluate_package, rep, max_cycles=MAX_REPAIR_CYCLES)
    assert outcome.final_result != Result.PASS
    assert outcome.quarantined is True
    assert 1 <= rep.calls <= MAX_REPAIR_CYCLES                     # bounded
    assert len(outcome.cycles) <= MAX_REPAIR_CYCLES
    assert {c.kind for c in outcome.cycles} == {"content"}
    assert H.release_files(pkg) == []
    assert "PUBLISH_AUTHORIZED" not in H.states(pkg)
    assert H.verify(pkg).code == 1


# 11 ---------------------------------------------------------------------------------------------------
def test_11_style_anomaly_only_passes_with_advisory_warning(pkg):
    mutate(pkg, inj.style_only)
    with FakeModels():
        r = H.authorize(pkg)
    assert r.code == 0, r.out
    assert_authorized(pkg)
    assert H.cycles(pkg) == []                                     # style never triggers a content repair
    rec = json.loads(H.runs(pkg)[-1].read_text())
    assert rec["result"] == "PASS" and rec["advisory"]
    assert "advisory" in (pkg / "evals/fingerprint-gate/SUMMARY.md").read_text().lower() or "report only" in r.out.lower()


# 12 ---------------------------------------------------------------------------------------------------
def _authorized(pkg):
    with FakeModels():
        assert H.authorize(pkg).code == 0
    assert H.verify(pkg).code == 0


def test_12a_missing_artifact_fails_verify(pkg):
    assert H.verify(pkg).code == 1                                 # never authorized
    _authorized(pkg)
    (pkg / "release/medium-final.md").unlink()
    assert H.verify(pkg).code == 1
    (pkg / "release/authorization.json").unlink()
    assert H.verify(pkg).code == 1


def test_12b_artifact_for_another_hash_fails_verify(pkg):
    _authorized(pkg)
    other = H.make_package(pkg.parent, "other")
    mutate(other, lambda t: t + "\nDifferent.\n")                   # a different final hash
    shutil.copytree(pkg / "release", other / "release")             # carrying another package's authorization
    assert H.verify(other).code == 1
    # tampered release bytes with an untouched authorization
    (pkg / "release/medium-final.md").write_text("tampered\n")
    assert H.verify(pkg).code == 1


def test_12c_obsolete_evaluator_id_fails_verify_and_authorize_reruns(pkg):
    _authorized(pkg)
    a = H.auth(pkg)
    a["binding"]["evaluator_id"] = "0" * 40
    (pkg / "release/authorization.json").write_text(json.dumps(a))
    assert H.verify(pkg).code == 1
    with FakeModels():
        assert H.authorize(pkg).code == 0
    assert H.auth(pkg)["binding"]["evaluator_id"] != "0" * 40
    assert H.verify(pkg).code == 0


# 13 ---------------------------------------------------------------------------------------------------
def test_13_queue_continues_past_an_unrepairable_package(tmp_path):
    pkgs = [H.make_package(tmp_path, f"pkg-{i}") for i in (1, 2, 3)]
    (pkgs[1] / "article-v8.md").unlink()                           # reference gone => repair cannot be grounded
    mutate(pkgs[1], inj.remove_one_link)
    codes = []
    with FakeModels():
        for p in pkgs:                                             # the driver loop: one authorize call per package
            codes.append(H.authorize(p).code)
    assert codes == [0, 3, 0], codes
    for p in (pkgs[0], pkgs[2]):
        assert_authorized(p)
    assert (pkgs[1] / "QUARANTINE.json").exists()
    assert json.loads((pkgs[1] / "QUARANTINE.json").read_text()).get("status") == "NEEDS_REVIEW"
    assert H.release_files(pkgs[1]) == []
    assert H.verify(pkgs[1]).code == 1
    assert "MISSING_SOURCE" in json.dumps(json.loads((pkgs[1] / "QUARANTINE.json").read_text())) or "MISSING_SOURCE" in H.categories(pkgs[1])


# 14 ---------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("kind", FAULT_KINDS)
def test_14_an_error_never_yields_release_files(pkg, kind):
    before = (pkg / "article-medium.md").read_bytes()
    with FakeModels([Fault("*", kind, times=None)]):
        r = H.authorize(pkg)
    assert r.code in (2, 3, 4), r.out
    assert H.release_files(pkg) == []
    assert not (pkg / "release").exists() or not any((pkg / "release").iterdir())
    assert "PUBLISH_AUTHORIZED" not in H.states(pkg)
    assert (pkg / "article-medium.md").read_bytes() == before     # outages never edit prose
    assert not list(pkg.glob("article-healed-*.md"))
    assert H.verify(pkg).code == 1
