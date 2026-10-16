"""Optional paid detector: disabled by default, measurement only, once per FINAL hash, errors never block, flagged sentences feed the corpus."""
import json

import pytest

from scripts.fingerprint_eval import detector_corpus as DC
from scripts.fingerprint_eval import detectors as DET
from scripts.write_pipeline import measure as MS
from scripts.write_pipeline import report as RP

TEXT = "# T\n\nThis is a sentence that reads very machine like. Here is one a person wrote on a Tuesday.\n"
SHA = "a" * 64
ENV = {"WRITE_PIPELINE_DETECTOR": "gptzero", "GPTZERO_API_KEY": "sekret-key"}
RESP = {"documents": [{"class_probabilities": {"ai": 0.7, "mixed": 0.2, "human": 0.1}, "sentences": [
    {"sentence": "This is a sentence that reads very machine like.", "generated_prob": 0.93},
    {"sentence": "Here is one a person wrote on a Tuesday.", "generated_prob": 0.04}]}]}


class Fake:
    def __init__(self, resp=RESP, exc=None):
        self.calls, self.resp, self.exc = [], resp, exc

    def __call__(self, url, headers, body):
        self.calls.append((url, headers, body))
        if self.exc:
            raise self.exc
        return self.resp


def run(pkg, tf, env=ENV, tmp=None):
    return MS.run(pkg, TEXT, SHA, env=env, transport=tf, corpus=(tmp or pkg) / "corpus.jsonl")


def test_disabled_by_default_and_without_key(tmp_path):
    tf = Fake()
    assert run(tmp_path, tf, env={}) is None
    assert run(tmp_path, tf, env={"WRITE_PIPELINE_DETECTOR": "gptzero"}) is None  # no key
    assert run(tmp_path, tf, env={"WRITE_PIPELINE_DETECTOR": "unknown", "GPTZERO_API_KEY": "k"}) is None
    assert run(tmp_path, tf, env={"GPTZERO_API_KEY": "k"}) is None  # key alone does not enable
    assert tf.calls == [] and not (tmp_path / "write-pipeline").exists()


def test_enabled_scores_writes_file_and_sends_the_text(tmp_path):
    tf = Fake()
    r = run(tmp_path, tf, tmp=tmp_path)
    url, headers, body = tf.calls[0]
    assert url == "https://api.gptzero.me/v2/predict/text" and headers["X-API-Key"] == "sekret-key" and body["document"] == TEXT
    assert r["ai_prob"] == 0.7 and r["mixed_prob"] == 0.2 and r["human_prob"] == 0.1 and r["error"] is None
    assert r["flagged_sentences"] == ["This is a sentence that reads very machine like."]
    f = tmp_path / f"write-pipeline/detector/gptzero-{SHA[:12]}.json"
    d = json.loads(f.read_text())
    assert d["text_sha256"] and d["name"] == "gptzero" and d["scored_at"] and "sekret" not in f.read_text()


def test_top_level_response_shape_is_accepted(tmp_path):
    r = run(tmp_path, Fake({"completely_generated_prob": 0.4, "sentences": [{"sentence": "A flagged one here now.", "generated_prob": 0.8}]}), tmp=tmp_path)
    assert r["ai_prob"] == 0.4 and r["flagged_sentences"] == ["A flagged one here now."]


def test_error_is_recorded_not_raised_not_cached_and_not_ingested(tmp_path):
    bad = Fake(exc=RuntimeError("boom sekret-key"))
    r = run(tmp_path, bad, tmp=tmp_path)
    assert r["error"] and "sekret-key" not in r["error"] and r["ai_prob"] is None
    assert not (tmp_path / "corpus.jsonl").exists()
    assert "unavailable" in "\n".join(MS.section_lines(tmp_path, SHA))
    ok = Fake()
    assert run(tmp_path, ok, tmp=tmp_path)["error"] is None and len(ok.calls) == 1  # an errored file is retried
    assert run(tmp_path, Fake({"junk": 1}), tmp=tmp_path)["error"] is None  # now cached: no new call needed


def test_scores_once_per_final_hash(tmp_path):
    tf = Fake()
    a = run(tmp_path, tf, tmp=tmp_path)
    b = run(tmp_path, tf, tmp=tmp_path)
    assert len(tf.calls) == 1 and a == b
    MS.run(tmp_path, TEXT + "x", "b" * 64, env=ENV, transport=tf, corpus=tmp_path / "corpus.jsonl")
    assert len(tf.calls) == 2


def test_flagged_sentences_feed_the_corpus_once(tmp_path):
    run(tmp_path, Fake(), tmp=tmp_path)
    rows = [json.loads(x) for x in (tmp_path / "corpus.jsonl").read_text().splitlines()]
    assert [(r["detector"], r["label"], r["sentence"], r["article_sha"]) for r in rows] == [("gptzero", "flagged", "This is a sentence that reads very machine like.", SHA)]
    assert DC.ingest_result("gptzero", {"flagged_sentences": ["This is a sentence that reads very machine like."]}, SHA, tmp_path / "corpus.jsonl")["added"] == 0
    assert DC.ingest_result("gptzero", {"error": "x", "flagged_sentences": ["Whatever four words here."]}, SHA, tmp_path / "c2.jsonl")["added"] == 0


def test_report_section_is_labelled_measurement_only(tmp_path):
    assert "DETECTOR MEASUREMENT" in RP.SECTIONS
    assert MS.section_lines(tmp_path, SHA) == ["- not run (optional, measurement only)"]
    run(tmp_path, Fake(), tmp=tmp_path)
    lines = "\n".join(MS.section_lines(tmp_path, SHA))
    assert "MEASUREMENT ONLY" in lines and "never a gate" in lines and "AI 0.7" in lines and "machine like" in lines


def test_registry_and_default_transport_never_used_when_injected():
    assert DET.get("gptzero", {"GPTZERO_API_KEY": ""}) is None
    assert DET.get("gptzero", ENV, Fake()).score(TEXT).ai_prob == 0.7
