"""Offline tests for classify / repair / circuit / heal and the error categories. Stub gate only; no model or network."""
import dataclasses
import hashlib
import json
import urllib.error
from pathlib import Path
from unittest import mock

import pytest

from scripts.fingerprint_eval import gateway as G
from scripts.fingerprint_eval import heal as H
from scripts.fingerprint_eval.circuit import Circuit
from scripts.fingerprint_eval.classify import classify, failure_categories
from scripts.fingerprint_eval.contracts import (CIRCUITS_FILE, INFRA_BACKOFF_SECONDS, Binding, Category, EvalRecord, HealCycle,
                                                PackageCtx, Result)
from scripts.fingerprint_eval.errors import EvaluationError
from scripts.fingerprint_eval.refs import find_refs, lost
from scripts.fingerprint_eval.repair import DeterministicRepairer, FaultyRepairer, write_healed
from scripts.fingerprint_eval.textutil import parse_blocks

REF = """# Title

The intro cites [Example](https://example.com/a) as the origin. Another sentence follows it.

## Part one

The reactor ran for forty days without a fault. See the [report](https://example.com/report) for details.

![diagram](img/d.png)

## Part two

The budget doubled in 2021 because of delays in shipping parts.

- item alpha
- item beta
"""


def sha(p: Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def mk_record(path, result=Result.PASS, cats=(), category=None, dep=None, models=None, reasons=None, claims=None):
    rec = EvalRecord(
        schema_version=1, slug="s", binding=Binding(sha(path), "ev", "corp"), final_path=str(path), final_rule="t",
        reference_path="ref.md", reference_sha256=None, reference_identical=False, timestamp_utc="t", evaluator_tree_sha256="",
        pipeline_corpus_sha256="", models=models or {}, claims=claims or {}, links={}, structure={}, semantic={}, advisory={},
        result=result, category=category or (Category.PASS if result == Result.PASS else Category.NEEDS_REVIEW),
        reasons=reasons or [], runtime_s=0.0, raw_report_path="")
    rec.failure_categories = list(cats)
    rec.dependency = dep
    return rec


def mini_gate(ref_path):
    """Tiny stand-in for the canonical gate: compares bytes to the reference with the same structural ideas."""
    ref = Path(ref_path).read_text()

    def secs(md):
        out, cur = {}, "(intro)"
        out[cur] = []
        for b in parse_blocks(md):
            if b.kind == "heading":
                cur = b.text
                out[cur] = []
            elif b.kind == "paragraph":
                out[cur].append(" ".join(b.text.split()))
        return out

    def gate(ctx, path):
        cand = Path(path).read_text()
        cats, reasons = [], []
        rh = [b.text for b in parse_blocks(ref) if b.kind != "paragraph"]
        ch = [b.text for b in parse_blocks(cand) if b.kind != "paragraph"]
        rs, cs = secs(ref), secs(cand)
        if rh != ch:
            cats.append(Category.STRUCTURAL_DAMAGE)
        if lost(find_refs(ref)["links"], find_refs(cand)["links"]):
            cats.append(Category.MISSING_LINK)
        if any(cs[h] != rs[h] for h in rs if h in cs and cs[h] and any(re_p for re_p in rs[h]) and _strip(cs[h]) != _strip(rs[h])):
            cats.append(Category.CONTENT_CLAIM_FAILURE)
        if any(h not in rs and cs[h] for h in cs):
            cats.append(Category.ADDED_UNSUPPORTED_CLAIM)
        if cats:
            return mk_record(path, Result.FAIL, cats, category=cats[0], reasons=[c.value for c in cats])
        return mk_record(path)

    return gate


def _strip(paras):
    import re
    return [re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", p) for p in paras]


@pytest.fixture
def pkg(tmp_path):
    (tmp_path / "article-v1.md").write_text(REF)
    return tmp_path


def make_ctx(pkg, cand_text, reference=True):
    final = pkg / "article-medium.md"
    final.write_text(cand_text)
    return PackageCtx(pkg, "slug", final, "article-medium", pkg / "article-v1.md" if reference else None, None)


def heal(ctx, gate, repairer=None, **kw):
    kw.setdefault("sleep", lambda s: None)
    kw.setdefault("workspace", ctx.package / "ws")
    return H.run_heal_loop(ctx, gate, repairer or DeterministicRepairer(), **kw)


# ---- classify -------------------------------------------------------------------------------------------------------------
def test_classify_paths(tmp_path):
    f = tmp_path / "a.md"
    f.write_text("x")
    assert classify(mk_record(f)) == Category.PASS
    assert classify(mk_record(f, Result.ERROR, category=Category.GATEWAY_FAILURE)) == Category.GATEWAY_FAILURE
    assert classify(mk_record(f, Result.ERROR, category=Category.MISSING_LINK)) == Category.UNKNOWN_ERROR
    r = mk_record(f, Result.FAIL, cats=[Category.MISSING_LINK, Category.CONTENT_CLAIM_FAILURE])
    assert classify(r) == Category.MISSING_LINK
    assert classify(mk_record(f, Result.FAIL, cats=["ADDED_UNSUPPORTED_CLAIM"])) == Category.ADDED_UNSUPPORTED_CLAIM
    r = mk_record(f, Result.FAIL, cats=[Category.MISSING_LINK, Category.MISSING_SOURCE])
    assert classify(r) == Category.MISSING_SOURCE
    r = mk_record(f, Result.FAIL, reasons=["STRUCTURAL_DAMAGE: heading gone"])
    assert classify(r) == Category.STRUCTURAL_DAMAGE
    assert classify(mk_record(f, Result.FAIL)) == Category.NEEDS_REVIEW
    r = mk_record(f, Result.FAIL, claims={"changed": 2})
    assert failure_categories(r) == [Category.CONTENT_CLAIM_FAILURE]


def test_classify_ignores_prose(tmp_path):
    f = tmp_path / "a.md"
    f.write_text("x")
    r = mk_record(f, Result.FAIL, reasons=["the link looks like it went missing, maybe a timeout"])
    assert classify(r) == Category.NEEDS_REVIEW


# ---- repair + loop: content path ----------------------------------------------------------------------------------------
def test_missing_link_attached_then_pass(pkg):
    ctx = make_ctx(pkg, REF.replace("[report](https://example.com/report)", "report"))
    gate = mini_gate(ctx.reference_path)
    out = heal(ctx, gate)
    assert out.final_result == Result.PASS and not out.quarantined
    assert len(out.cycles) == 1 and out.cycles[0].kind == "content"
    assert out.final_path.name == "article-healed-1.md" and out.final_path.read_text().count("[report](https://example.com/report)") == 1
    assert out.cycles[0].output_sha256 == sha(out.final_path) != out.cycles[0].input_sha256
    assert "re-attached link" in out.cycles[0].repair and "article-v1.md" in out.cycles[0].repair
    assert (pkg / "article-medium.md").read_text() != out.final_path.read_text()  # original untouched


def test_missing_link_paragraph_restored(pkg):
    ctx = make_ctx(pkg, REF.replace("See the [report](https://example.com/report) for details.", "See the findings for details."))
    out = heal(ctx, mini_gate(ctx.reference_path))
    assert out.final_result == Result.PASS
    assert "restored" in out.cycles[0].repair


def test_deleted_section_restored(pkg):
    ctx = make_ctx(pkg, REF.split("## Part two")[0])
    out = heal(ctx, mini_gate(ctx.reference_path))
    assert out.final_result == Result.PASS
    assert "## Part two" in out.final_path.read_text() and "- item beta" in out.final_path.read_text()


def test_deleted_image_and_list_restored_in_place(pkg):
    ctx = make_ctx(pkg, REF.replace("![diagram](img/d.png)\n\n", "").replace("- item alpha\n", ""))
    out = heal(ctx, mini_gate(ctx.reference_path))
    assert out.final_result == Result.PASS
    healed = out.final_path.read_text()
    assert healed.index("![diagram]") < healed.index("## Part two")


def test_changed_claim_section_restored(pkg):
    ctx = make_ctx(pkg, REF.replace("doubled in 2021", "tripled in 2021"))
    out = heal(ctx, mini_gate(ctx.reference_path))
    assert out.final_result == Result.PASS and "doubled" in out.final_path.read_text()


def test_added_unsupported_without_reference_section_needs_review(pkg):
    ctx = make_ctx(pkg, REF + "\n## Bonus\n\nRevenue grew 900% thanks to a secret deal.\n")
    calls = []
    inner = mini_gate(ctx.reference_path)
    out = heal(ctx, lambda c, p: (calls.append(p), inner(c, p))[1])
    assert out.final_result == Result.FAIL and out.category == Category.NEEDS_REVIEW and out.quarantined
    assert len(calls) == 1 and out.cycles == []
    q = json.loads((pkg / "QUARANTINE.json").read_text())
    assert q["category"] == "NEEDS_REVIEW" and q["kind"] == "content" and q["retryable"] is False
    assert q["content_sha256"] == sha(ctx.final_path) and "no counterpart" in q["reason"]
    assert not list(pkg.glob("article-healed-*.md"))


def test_added_unsupported_in_existing_section_restored(pkg):
    ctx = make_ctx(pkg, REF.replace("parts.", "parts. Profits rose 900%."))
    inner = mini_gate(ctx.reference_path)

    def gate(c, p):  # classify the extra sentence as an unsupported claim
        r = inner(c, p)
        if r.result == Result.FAIL:
            r.failure_categories = [Category.ADDED_UNSUPPORTED_CLAIM]
            r.category = Category.ADDED_UNSUPPORTED_CLAIM
        return r
    out = heal(ctx, gate)
    assert out.final_result == Result.PASS and "900%" not in out.final_path.read_text()


def test_no_reference_or_missing_source_declines(pkg):
    ctx = make_ctx(pkg, REF.replace("doubled", "tripled"), reference=False)
    rec = mk_record(ctx.final_path, Result.FAIL, [Category.CONTENT_CLAIM_FAILURE])
    assert DeterministicRepairer()(ctx, ctx.final_path, rec, 1) is None
    ctx2 = make_ctx(pkg, REF.replace("doubled", "tripled"))
    rec = mk_record(ctx2.final_path, Result.FAIL, [Category.MISSING_SOURCE])
    assert DeterministicRepairer()(ctx2, ctx2.final_path, rec, 1) is None


def test_healed_files_never_overwritten(pkg):
    ctx = make_ctx(pkg, "x")
    (pkg / "article-healed-1.md").write_text("old")
    p = write_healed(ctx, 1, "new")
    assert p.name == "article-healed-2.md" and (pkg / "article-healed-1.md").read_text() == "old"


def test_faulty_repairer_never_passes_and_quarantines_after_max(pkg):
    ctx = make_ctx(pkg, REF.replace("[report](https://example.com/report)", "report"))
    out = heal(ctx, mini_gate(ctx.reference_path), FaultyRepairer())
    assert out.final_result != Result.PASS and out.quarantined and out.category == Category.NEEDS_REVIEW
    assert len(out.cycles) == 3
    assert all("WORSE" in c.repair for c in out.cycles)
    assert (pkg / "QUARANTINE.json").exists()
    assert json.loads((pkg / "QUARANTINE.json").read_text())["artifacts"]


def test_max_cycles_honored(pkg):
    ctx = make_ctx(pkg, REF.replace("[report](https://example.com/report)", "report"))
    out = heal(ctx, mini_gate(ctx.reference_path), FaultyRepairer(), max_cycles=2)
    assert len(out.cycles) == 2 and out.quarantined


def test_repairer_cannot_pass_without_gate(pkg):
    """A repairer returning anything: PASS exists only if gate_fn says so on the new bytes."""
    ctx = make_ctx(pkg, REF.replace("doubled", "tripled"))

    def always_fail(c, p):
        return mk_record(p, Result.FAIL, [Category.CONTENT_CLAIM_FAILURE])
    out = heal(ctx, always_fail)
    assert out.final_result == Result.FAIL and out.quarantined and out.category == Category.NEEDS_REVIEW
    assert len(out.cycles) == 1  # second repair has nothing left to restore from the reference -> declined


def test_noop_repair_quarantines(pkg):
    ctx = make_ctx(pkg, REF)
    rec_gate = lambda c, p: mk_record(p, Result.FAIL, [Category.MISSING_LINK])  # noqa: E731
    out = heal(ctx, rec_gate)
    assert out.quarantined and out.cycles == []


def test_pass_must_match_bytes(pkg):
    ctx = make_ctx(pkg, REF)
    stale = mk_record(ctx.final_path)
    stale.binding = Binding("0" * 64, "ev", "corp")
    out = heal(ctx, lambda c, p: stale)
    assert out.final_result != Result.PASS and out.category == Category.STALE_EVALUATION


def test_every_cycle_complete(pkg):
    ctx = make_ctx(pkg, REF.replace("[report](https://example.com/report)", "report"))
    out = heal(ctx, mini_gate(ctx.reference_path), FaultyRepairer())
    for i, c in enumerate(out.cycles, 1):
        assert c.index == i and len(c.input_sha256) == 64 and len(c.output_sha256) == 64
        assert isinstance(c.category, Category) and c.kind in ("content", "infra") and c.repair
        assert isinstance(c.result, Result) and c.elapsed_s >= 0 and isinstance(c.reasons, list)
        d = H.cycle_dict(c)
        assert d["category"] == c.category.value and d["result"] == c.result.value
        assert set(d) == {f.name for f in dataclasses.fields(HealCycle)}


# ---- infra path -------------------------------------------------------------------------------------------------------
def scripted(path_gate, errors):
    calls = []

    def gate(ctx, path):
        calls.append(path)
        if errors:
            cat, dep = errors.pop(0)
            return mk_record(path, Result.ERROR, category=cat, dep=dep)
        return path_gate(ctx, path)
    gate.calls = calls
    return gate


def test_gateway_failure_twice_then_ok_bytes_unchanged(pkg):
    ctx = make_ctx(pkg, REF)
    before = sha(ctx.final_path)
    sleeps = []
    gate = scripted(mini_gate(ctx.reference_path), [(Category.GATEWAY_FAILURE, "gateway-chat")] * 2)
    out = heal(ctx, gate, sleep=sleeps.append, probes={"gateway-models": lambda: True})
    assert out.final_result == Result.PASS and sha(out.final_path) == before and out.final_path == ctx.final_path
    assert sleeps == list(INFRA_BACKOFF_SECONDS[:2])
    assert [c.kind for c in out.cycles] == ["infra", "infra"]
    assert all(c.output_sha256 == c.input_sha256 for c in out.cycles)
    assert Circuit("gateway-chat", ctx.package / "ws").state()["state"] == "closed"


def test_three_gateway_failures_open_circuit_and_stop_calling(pkg):
    ctx = make_ctx(pkg, REF)
    gate = scripted(mini_gate(ctx.reference_path), [(Category.GATEWAY_FAILURE, "gateway-embed")] * 10)
    out = heal(ctx, gate, probes={"gateway-models": lambda: False})
    assert len(gate.calls) == 3
    assert out.quarantined and out.category == Category.GATEWAY_FAILURE and out.final_result == Result.ERROR
    q = json.loads((pkg / "QUARANTINE.json").read_text())
    assert q["kind"] == "infra" and q["retryable"] is True and q["category"] == "GATEWAY_FAILURE"
    st = json.loads((pkg / "ws" / CIRCUITS_FILE).read_text())["gateway-embed"]
    assert st["state"] == "open" and st["consecutive_failures"] == 3 and st["opened_at"] and st["next_probe_at"]
    assert not list(pkg.glob("article-healed-*.md"))
    # the next article in the queue sees the open circuit: no retry calls
    gate2 = scripted(mini_gate(ctx.reference_path), [(Category.GATEWAY_FAILURE, "gateway-embed")] * 10)
    heal(ctx, gate2)
    assert len(gate2.calls) == 1


def test_open_circuit_uses_fallback_when_available(pkg):
    ctx = make_ctx(pkg, REF)
    models = {"judge": {"name": "claude-sonnet", "backend": "claude-cli"}}
    inner = mini_gate(ctx.reference_path)
    calls = []

    def gate(c, p):
        calls.append(p)
        return mk_record(p, Result.ERROR, category=Category.MODEL_UNAVAILABLE, dep="claude-cli", models=models)
    used = []
    out = heal(ctx, gate, fallback_gate_fn=lambda c, p, m: (used.append(m), inner(c, p))[1])
    assert out.final_result == Result.PASS and used == ["qwen3:8b"] and len(calls) == 1
    assert out.cycles[0].repair.startswith("fallback:qwen3:8b") and out.cycles[0].model == "qwen3:8b"


def test_malformed_output_falls_back_to_model(pkg):
    ctx = make_ctx(pkg, REF)
    models = {"judge": {"name": "claude-sonnet", "backend": "claude-cli"}}
    inner = mini_gate(ctx.reference_path)
    gate = lambda c, p: mk_record(p, Result.ERROR, category=Category.MALFORMED_MODEL_OUTPUT, dep="claude-cli", models=models)  # noqa: E731
    seen = []
    out = heal(ctx, gate, fallback_gate_fn=lambda c, p, m: (seen.append(m), inner(c, p))[1])
    assert out.final_result == Result.PASS and seen == ["qwen3:8b"] and sha(out.final_path) == sha(ctx.final_path)


def test_embeddings_have_no_fallback(pkg):
    ctx = make_ctx(pkg, REF)
    gate = lambda c, p: mk_record(p, Result.ERROR, category=Category.MODEL_UNAVAILABLE, dep="gateway-embed")  # noqa: E731
    used = []
    out = heal(ctx, gate, fallback_gate_fn=lambda c, p, m: used.append(m))
    assert not used and out.quarantined and out.category == Category.MODEL_UNAVAILABLE


def test_fallback_then_content_repair_uses_fallback_model(pkg):
    ctx = make_ctx(pkg, REF.replace("doubled", "tripled"))
    models = {"judge": {"name": "claude-sonnet", "backend": "claude-cli"}}
    inner = mini_gate(ctx.reference_path)
    primary = lambda c, p: mk_record(p, Result.ERROR, category=Category.MALFORMED_MODEL_OUTPUT, dep="claude-cli", models=models)  # noqa: E731
    seen = []
    out = heal(ctx, primary, fallback_gate_fn=lambda c, p, m: (seen.append(m), inner(c, p))[1])
    assert out.final_result == Result.PASS
    assert seen == ["qwen3:8b", "qwen3:8b"]  # initial fallback + re-gate of the repaired bytes
    assert [c.kind for c in out.cycles] == ["infra", "content"]


def test_infra_never_modifies_bytes_guard(pkg):
    ctx = make_ctx(pkg, REF)

    def evil(c, p):
        p.write_text("tampered")
        return mk_record(p)
    with pytest.raises(RuntimeError, match="invariant"):
        heal(ctx, evil)


def test_probe_allowlist():
    with pytest.raises(ValueError):
        H.run_probe("rm -rf", {"rm -rf": lambda: True})
    assert H.run_probe("doppler-env", {"doppler-env": lambda: True}) is True
    assert H.run_probe("doppler-env", {"doppler-env": lambda: 1 / 0}) is False


def test_get_repairer_env_gate(monkeypatch):
    monkeypatch.setenv("FINGERPRINT_EVAL_REPAIRER", "scripts.fingerprint_eval.repair:FaultyRepairer")
    monkeypatch.delenv("FINGERPRINT_EVAL_TEST_MODE", raising=False)
    assert isinstance(H.get_repairer(), DeterministicRepairer)
    monkeypatch.setenv("FINGERPRINT_EVAL_TEST_MODE", "1")
    assert isinstance(H.get_repairer(), FaultyRepairer)


# ---- circuit breaker --------------------------------------------------------------------------------------------------
def test_circuit_lifecycle(tmp_path):
    now = [1_000_000.0]
    c = Circuit("gateway-chat", tmp_path, clock=lambda: now[0], cooldown=1800)
    assert c.allow()
    c.record_failure(Category.GATEWAY_FAILURE)
    c.record_failure(Category.GATEWAY_FAILURE)
    assert c.allow() and c.state()["state"] == "closed" and c.state()["opened_at"] is None
    c.record_failure(Category.GATEWAY_FAILURE)
    st = json.loads((tmp_path / CIRCUITS_FILE).read_text())["gateway-chat"]
    assert st["state"] == "open" and st["opened_at"] and st["last_category"] == "GATEWAY_FAILURE"
    assert not c.allow()
    now[0] += 1799
    assert not c.allow()
    now[0] += 2
    assert c.allow() and c.state()["state"] == "half_open" and c.state()["opened_at"]
    assert not c.allow()  # single probe in flight
    c.record_failure(Category.GATEWAY_FAILURE)
    assert c.state()["state"] == "open" and not c.allow()
    now[0] += 1801
    assert c.allow()
    c.record_success()
    st = c.state()
    assert st["state"] == "closed" and st["consecutive_failures"] == 0 and st["opened_at"] is None and c.allow()
    assert [t["to"] for t in st["transitions"]] == ["open", "half_open", "open", "half_open", "closed"]


def test_circuit_persists_across_instances_and_isolates_dependencies(tmp_path):
    a = Circuit("claude-cli", tmp_path)
    for _ in range(3):
        a.record_failure(Category.MODEL_TIMEOUT)
    assert not Circuit("claude-cli", tmp_path).allow()
    assert Circuit("codex-cli", tmp_path).allow()
    assert not list((tmp_path / CIRCUITS_FILE).parent.glob("*.tmp"))
    with pytest.raises(ValueError):
        Circuit("made-up", tmp_path)


def test_circuit_corrupt_file_is_closed(tmp_path):
    p = tmp_path / CIRCUITS_FILE
    p.parent.mkdir(parents=True)
    p.write_text("{not json")
    assert Circuit("doppler", tmp_path).allow()


# ---- error categories -------------------------------------------------------------------------------------------------
def test_error_defaults():
    e = EvaluationError("x")
    assert e.category == Category.UNKNOWN_ERROR and e.dependency is None


def test_gateway_categories(monkeypatch):
    monkeypatch.delenv("LLM_GATEWAY_API_KEY", raising=False)
    with pytest.raises(G.GatewayError) as ei:
        G._key()
    assert ei.value.category == Category.DEPENDENCY_FAILURE and ei.value.dependency == "doppler"
    monkeypatch.setenv("LLM_GATEWAY_API_KEY", "k")
    monkeypatch.setattr(G.time, "sleep", lambda s: None)

    def failing(exc):
        return mock.patch.object(G.urllib.request, "urlopen", side_effect=exc)

    with failing(urllib.error.URLError(TimeoutError("timed out"))):
        with pytest.raises(G.GatewayError) as ei:
            G.chat("m", "p")
    assert ei.value.category == Category.MODEL_TIMEOUT and ei.value.dependency == "gateway-chat"
    with failing(urllib.error.URLError(ConnectionRefusedError("refused"))):
        with pytest.raises(G.GatewayError) as ei:
            G.chat("m", "p")
    assert ei.value.category == Category.GATEWAY_FAILURE
    err = urllib.error.HTTPError("u", 524, "x", {}, mock.MagicMock(read=lambda: b"timeout"))
    with failing(err):
        with pytest.raises(G.GatewayError) as ei:
            G._post("/embeddings", {}, retries=0)
    assert ei.value.category == Category.GATEWAY_FAILURE and ei.value.dependency == "gateway-embed"
    err = urllib.error.HTTPError("u", 404, "x", {}, mock.MagicMock(read=lambda: b"model not found"))
    with failing(err):
        with pytest.raises(G.GatewayError) as ei:
            G.chat("m", "p")
    assert ei.value.category == Category.MODEL_UNAVAILABLE


def test_cli_and_parse_categories():
    with mock.patch.object(G.subprocess, "run", side_effect=FileNotFoundError("claude")):
        with pytest.raises(G.GatewayError) as ei:
            G.claude_cli("p")
    assert ei.value.category == Category.DEPENDENCY_FAILURE and ei.value.dependency == "claude-cli"
    import subprocess
    with mock.patch.object(G.subprocess, "run", side_effect=subprocess.TimeoutExpired("claude", 1)):
        with pytest.raises(G.GatewayError) as ei:
            G.claude_cli("p")
    assert ei.value.category == Category.MODEL_TIMEOUT
    with pytest.raises(G.GatewayError) as ei:
        G.extract_json("no json here")
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT
    with pytest.raises(G.GatewayError) as ei:
        G.validate_embeddings([], 2)
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT


def test_judge_failure_is_malformed_output():
    from scripts.fingerprint_eval.judge import judge_claims
    from scripts.fingerprint_eval.rewrite import Segment
    seg = mock.MagicMock(spec=Segment)
    seg.frozen, seg.propositions, seg.output, seg.section = False, [{"claim": "a"}], "t", "s"
    model = mock.MagicMock(backend="claude-cli", complete=mock.MagicMock(return_value="not json"))
    with pytest.raises(EvaluationError) as ei:
        judge_claims([seg], model, strict=True)
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT
    model.complete.side_effect = G.GatewayError("t", Category.MODEL_TIMEOUT, "claude-cli")
    with pytest.raises(EvaluationError) as ei:
        judge_claims([seg], model, strict=True)
    assert ei.value.category == Category.MODEL_TIMEOUT and ei.value.dependency == "claude-cli"
