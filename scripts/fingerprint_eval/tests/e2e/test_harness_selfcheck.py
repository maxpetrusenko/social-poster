"""Runs NOW against the existing gate.run_gate: proves the fakes judge by text comparison, the injectors
break what they claim to, and faults surface as ERROR. Guards the e2e harness itself."""
import json
import tempfile
from pathlib import Path

import pytest

from scripts.fingerprint_eval import gate as GATE
from scripts.fingerprint_eval.tests.e2e import injectors as inj
from scripts.fingerprint_eval.tests.e2e.fakes import Fault, FakeModels, verdict_for
from scripts.fingerprint_eval.tests.e2e.harness import FIXTURE

REF = (FIXTURE / "article-v8.md").read_text()
MEDIUM = (FIXTURE / "article-medium.md").read_text()


def gate(final: str, faults=None, judge="claude:sonnet"):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "a").mkdir(); (root / "p").mkdir()
        art, ref = root / "article.md", root / "ref.md"
        art.write_text(final); ref.write_text(REF)
        with FakeModels(faults) as fm:
            rc = GATE.run_gate(art, ref, root / "a", root / "p", root / "out", judge, 0.90, "claude:sonnet")
        return rc, json.loads((root / "out/gate.json").read_text()), fm


def test_fixture_resolution_and_bytes():
    assert MEDIUM != REF and MEDIUM.startswith(REF)
    ref_hash = json.loads((FIXTURE / "evals/prepublish-v1.json").read_text())["article_sha256"]
    from hashlib import sha256
    assert sha256(REF.encode()).hexdigest() == ref_hash


def test_verdict_for_is_text_comparison():
    support = "The reactor ran for forty days. Nobody disputed that."
    assert verdict_for("The reactor ran for forty days.", support) == "entailed"
    assert verdict_for("The reactor ran for fifty days.", support) == "changed"
    assert verdict_for("Quantum bananas orbit Jupiter.", support) == "missing"


def test_clean_passes():
    rc, g, fm = gate(MEDIUM)
    assert rc == 0, g["reasons"]
    assert fm.faults_fired == []


@pytest.mark.parametrize("name", ["missing_link", "altered_claim", "deleted_section", "deleted_image"])
def test_content_mutations_fail_the_real_gate(name):
    rc, g, _ = gate(inj.MUTATIONS[name](MEDIUM))
    assert rc == 1 and g["reasons"], name


def test_style_only_passes_blocking_checks():
    rc, g, _ = gate(inj.style_only(MEDIUM))
    assert rc == 0, g["reasons"]


def test_unsupported_section_is_present_but_not_gate_detectable_yet():
    """gate.py only judges reference claims against the final; added claims need the W1/W2 check."""
    mutated = inj.add_unsupported_section(MEDIUM)
    assert "vitamin Q" in mutated
    assert "vitamin Q" not in REF


def test_modify_after_pass_changes_bytes(tmp_path):
    f = tmp_path / "a.md"; f.write_text(MEDIUM)
    new = inj.modify_after_pass(f)
    assert new != MEDIUM and f.read_text() == new


@pytest.mark.parametrize("kind", ["timeout", "http_5xx", "http_524", "refused", "model_not_found"])
def test_persistent_error_faults_are_gate_error(kind):
    rc, g, fm = gate(MEDIUM, [Fault("*", kind, times=None)])
    assert rc == 2 and g["evaluated"] is False
    assert fm.faults_fired and all(k == kind for _, k in fm.faults_fired)


def test_persistent_malformed_judge_is_gate_error():
    rc, g, _ = gate(MEDIUM, [Fault("*", "malformed", times=None)])
    assert rc == 2


def test_transient_malformed_is_absorbed_by_the_judges_retry():
    # extraction (no retry) runs first, then judging; skip all extraction calls so the garbled reply lands on the judge
    total = gate(MEDIUM)[2].calls["claude_cli"]
    rc, g, fm = gate(MEDIUM, [Fault("claude_cli", "malformed", times=1, skip=total // 2)])
    assert rc == 0, g["reasons"]
    assert ("claude_cli", "malformed") in fm.faults_fired


def test_scripted_faults_count_and_skip():
    f = Fault("chat", "timeout", times=2, skip=1)
    seq = [f.fire() for _ in range(5)]
    assert seq == [False, True, True, False, False]
