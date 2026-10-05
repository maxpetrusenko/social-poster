"""Gate speed: pipeline corpus rule, bounded parallelism with deterministic order and fail-closed errors, embedding batching."""
from __future__ import annotations

import threading
import time

import pytest

from scripts.fingerprint_eval import added as A
from scripts.fingerprint_eval import extract_cache, guards
from scripts.fingerprint_eval import judge as J
from scripts.fingerprint_eval.authz import pipeline_corpus_sha256
from scripts.fingerprint_eval.errors import EvaluationError
from scripts.fingerprint_eval.gateway import GatewayError, Model
from scripts.fingerprint_eval.rewrite import Segment
from scripts.fingerprint_eval.textutil import Block, max_parallel, parallel_map, resolve_pipeline_corpus
from scripts.write_pipeline import editguard as EG


# ---- corpus path rule ----
def test_corpus_env_wins(tmp_path):
    d = tmp_path / "corp"
    d.mkdir()
    assert resolve_pipeline_corpus({"FINGERPRINT_PIPELINE_CORPUS": str(d)}, tmp_path) == d


def test_corpus_default_when_present_else_none(tmp_path):
    assert resolve_pipeline_corpus({}, tmp_path) is None
    d = tmp_path / ".cache/fingerprint-eval/pipeline"
    d.mkdir(parents=True)
    assert resolve_pipeline_corpus({}, tmp_path) == d
    assert resolve_pipeline_corpus({"FINGERPRINT_PIPELINE_CORPUS": str(tmp_path / "missing")}, tmp_path) == d


def test_gate_argv_never_uses_package_parent(tmp_path, monkeypatch):
    monkeypatch.setattr(EG, "REPO", tmp_path)
    pkg = tmp_path / "Desktop" / "pkg"
    argv = EG.gate_argv(tmp_path / "a.md", tmp_path / "d.md", tmp_path / "out", pkg, environ={})
    assert "--pipeline-corpus" not in argv
    assert str(pkg.parent) not in argv
    d = tmp_path / "configured"
    d.mkdir()
    argv = EG.gate_argv(tmp_path / "a.md", tmp_path / "d.md", tmp_path / "out", pkg, environ={"FINGERPRINT_PIPELINE_CORPUS": str(d)})
    assert argv[argv.index("--pipeline-corpus") + 1] == str(d)


def test_authz_corpus_hash_unavailable_without_config(tmp_path, monkeypatch):
    monkeypatch.delenv("FINGERPRINT_PIPELINE_CORPUS", raising=False)
    from scripts.fingerprint_eval import authz
    monkeypatch.setattr(authz, "REPO", tmp_path)
    assert pipeline_corpus_sha256() == "unavailable"


def test_advisory_without_corpus_records_error_and_does_not_raise(tmp_path):
    from scripts.fingerprint_eval import gate
    author = tmp_path / "author"
    author.mkdir()
    for i in range(2):
        (author / f"{i}.txt").write_text("I wrote this a long time ago. It was a plain sentence about nothing. " * 20)
    out = gate._advisory("A short final text. Another sentence here.", "A short draft text. Another sentence here.", author, None, "slug")
    assert out["advisory_errors"] == ["pipeline corpus unavailable"]
    assert out["stylistic_structural"]["pipeline_outlier"] is None


# ---- parallelism ----
def test_parallel_map_order_and_bound(monkeypatch):
    monkeypatch.setenv("FG_MAX_PARALLEL", "3")
    assert max_parallel() == 3
    live, peak, lock = 0, 0, threading.Lock()

    def fn(x):
        nonlocal live, peak
        with lock:
            live += 1
            peak = max(peak, live)
        time.sleep(0.02 * (10 - x))  # later items finish first
        with lock:
            live -= 1
        return x * x

    assert parallel_map(fn, list(range(10))) == [x * x for x in range(10)]
    assert 1 < peak <= 3


def test_max_parallel_default_and_bad_env(monkeypatch):
    monkeypatch.delenv("FG_MAX_PARALLEL", raising=False)
    assert max_parallel() == 4
    monkeypatch.setenv("FG_MAX_PARALLEL", "zero")
    assert max_parallel() == 4


def test_parallel_map_worker_exception_raises_earliest_after_all_finish():
    done = []

    def fn(x):
        time.sleep(0.01)
        done.append(x)
        if x in (2, 5):
            raise ValueError(f"boom{x}")
        return x

    with pytest.raises(ValueError, match="boom2"):
        parallel_map(fn, list(range(8)), workers=4)
    assert sorted(done) == list(range(8))  # nothing left running


def _seg(idx, claims, out=""):
    s = Segment(idx=idx, section=f"S{idx}", section_idx=idx, blocks=[Block("paragraph", f"ref {idx}")])
    s.propositions = [{"claim": c} for c in claims]
    s.output = out
    return s


def _judge_segments(n):
    return [_seg(i, [f"claim {i}.{k}" for k in range(2)], f"changed text {i}") for i in range(n)]


def test_judge_order_deterministic_under_parallelism(monkeypatch):
    segs = _judge_segments(8)

    def fake_call(judge, claims, passage):
        i = int(claims[0].split()[1].split(".")[0])
        time.sleep(0.01 * (8 - i))
        return {1: {"verdict": "entailed" if i % 2 else "changed", "reason": f"r{i}"}, 2: {"verdict": "entailed"}}, 1

    monkeypatch.setattr(J, "_call", fake_call)
    res = J.judge_claims(segs, Model("m", "gateway", "m"), strict=True)
    assert [f["claim"] for f in res["flagged"]] == [f"claim {i}.0" for i in range(0, 8, 2)]
    assert res["total"] == 16 and res["judge_calls"] == 8


def test_judge_worker_exception_is_error(monkeypatch):
    segs = _judge_segments(6)

    def fake_call(judge, claims, passage):
        if claims[0] == "claim 3.0":
            raise RuntimeError("worker crashed")  # not a GatewayError: must still fail closed
        return {1: {"verdict": "entailed"}, 2: {"verdict": "entailed"}}, 1

    monkeypatch.setattr(J, "_call", fake_call)
    with pytest.raises(RuntimeError):
        J.judge_claims(segs, Model("m", "gateway", "m"), strict=True)


def test_judge_gateway_error_in_one_segment_is_evaluation_error(monkeypatch):
    segs = _judge_segments(6)

    def fake_call(judge, claims, passage):
        if claims[0] == "claim 4.0":
            raise GatewayError("slow call timed out")
        return {1: {"verdict": "entailed"}, 2: {"verdict": "entailed"}}, 1

    monkeypatch.setattr(J, "_call", fake_call)
    with pytest.raises(EvaluationError):
        J.judge_claims(segs, Model("m", "gateway", "m"), strict=True)


def test_extraction_parallel_keeps_segments_and_fails_closed(monkeypatch, tmp_path):
    segs = _judge_segments(6)
    for s in segs:
        s.propositions = []
    state = {"fail": False}

    def fake_extract(seg, spec):
        time.sleep(0.01 * (6 - seg.idx))
        if seg.idx == 4 and state["fail"]:
            raise GatewayError("extractor down")
        seg.propositions = [{"claim": f"c{seg.idx}", "links": [], "sentence_ids": [1]}]

    monkeypatch.setattr(extract_cache, "extract_propositions", fake_extract)
    monkeypatch.setattr(extract_cache, "extractor_id", lambda spec: "x")
    monkeypatch.setattr(extract_cache, "_cover_reference", lambda prose, spec: False)
    extract_cache.ensure_extraction(segs, "md", "spec", tmp_path / "c.json", True)
    assert [s.propositions[0]["claim"] for s in segs] == [f"c{i}" for i in range(6)]
    state["fail"] = True
    with pytest.raises(EvaluationError):
        extract_cache.ensure_extraction(segs, "md", "spec", tmp_path / "c.json", True)


def test_added_sections_parallel_order_and_error(monkeypatch):
    new = {f"S{i}": [f"Sentence number {i} is new here."] for i in range(4)}
    state = {"fail": False}
    monkeypatch.setattr(A, "new_sentences", lambda d, f: new)
    monkeypatch.setattr(A, "resolve_model", lambda spec: Model("m", "gateway", "m"))

    def fake_extract(sents, section, spec):
        time.sleep(0.01 * (4 - int(section[1:])))
        if section == "S2" and state["fail"]:
            raise GatewayError("boom")
        return [sents[0].rstrip(".")], {1}

    monkeypatch.setattr(A, "_extract_claims", fake_extract)
    monkeypatch.setattr(A, "_reference_section", lambda d, s: "ref")
    monkeypatch.setattr(A, "_call", lambda model, prompt, what: '[{"i": 1, "verdict": "unsupported", "reason": "r"}]')
    res = A.check_added("d", "f", None, "x", "j")
    assert [u["section"] for u in res["unsupported"]] == ["S0", "S1", "S2", "S3"]
    state["fail"] = True
    with pytest.raises(Exception):
        A.check_added("d", "f", None, "x", "j")


# ---- embedding batching ----
def test_embed_batches_at_64(monkeypatch):
    calls = []

    def fake_embed(texts):
        calls.append(len(texts))
        return [[1.0, float(len(t) % 7 + 1)] for t in texts]

    monkeypatch.setattr(guards, "embed", fake_embed)
    out = guards._embed([f"t{i}" for i in range(150)])
    assert calls == [64, 64, 22] and len(out) == 150


def test_semantic_similarity_one_request_per_64_chunks(monkeypatch):
    calls = []

    def fake_embed(texts):
        calls.append(len(texts))
        return [[1.0, float(i % 5 + 1)] for i, _ in enumerate(texts)]

    monkeypatch.setattr(guards, "embed", fake_embed)
    doc = "\n\n".join(f"## Section {i}\n\nParagraph text for section {i} with several words in it." for i in range(12))
    sim = guards.semantic_similarity(doc, doc)
    assert calls == [24]  # 12 sections x 2 sides in ONE request, not 24
    assert 0.0 < sim["whole"] <= 1.0
