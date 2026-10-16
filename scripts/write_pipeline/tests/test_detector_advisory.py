"""Detector patterns are advisory in the pipeline: the compare sidecar and the brief carry them, nothing scores or gates on them."""
import json

from scripts.fingerprint_eval import detector_corpus as DC
from scripts.fingerprint_eval import patterns as PT
from scripts.write_pipeline import brief as BR
from scripts.write_pipeline import compare as CMP
from scripts.write_pipeline import fpcontract as C

from .test_compare import CLEAN, _package


def test_compare_sidecar_carries_pattern_counts_and_readability_per_stage_outside_bad_direction(tmp_path):
    pkg = _package(tmp_path, final=CLEAN + "\nSo the whole thing hinges on bread.\n")
    out = tmp_path / "fp.json"
    assert CMP.main(["--package", str(pkg), "--out", str(out)]) == 0
    doc = json.loads(out.read_text())
    for name, st in doc["stages"].items():
        assert set(st["patterns"]["counts"]) == set(PT.PATTERNS) and st["patterns"]["advisory"] is True
        assert {"flesch", "grade", "long_sentence_share"} <= set(st["readability"])
    assert doc["stages"]["final"]["patterns"]["counts"]["so_closer"] == 1 and doc["stages"]["draft"]["patterns"]["counts"]["so_closer"] == 0
    assert not set(PT.PATTERNS) & set(doc["bad_direction"]) and "readability" not in doc["bad_direction"]
    assert doc["stages"]["final"]["contract"]["composite"] == C.signals(CLEAN + "\nSo the whole thing hinges on bread.\n")["composite"]


def test_detector_block_is_separate_covers_every_pattern_and_sets_the_readability_target():
    t = {"readability": {"median_sentence_words": min(21, BR.READABILITY_MEDIAN_CEILING), "max_grade": BR.READABILITY_MAX_GRADE}}
    assert set(BR.PATTERN_ADVICE) == set(PT.PATTERNS)
    block = BR.detector_patterns_block(t, ["Flagged one sentence here today."] * 7)
    assert "median sentence 16 words" in block and "grade 9 or lower" in block
    assert block.count('- "Flagged') == 5  # up to five recent flagged rows
    assert BR.PROMPT_BLOCK_WORDS == 300


def test_brief_artifact_has_detector_patterns_block_apart_from_the_prompt_block(d):
    d.to_stage("brief")
    rc, out = d.cli("run", "brief")
    assert rc == 0 and out["detector_patterns_block"] and out["detector_patterns_block"] != out["generation_prompt_block"]
    assert out["detector_patterns_block"] not in out["generation_prompt_block"] and len(out["generation_prompt_block"].split()) <= BR.PROMPT_BLOCK_WORDS
    st = json.loads((d.pkg / "write-pipeline/state.json").read_text())["stages"]["brief"]["artifact"]
    art = json.loads((d.pkg / st).read_text())
    t = art["targets"]["readability"]
    assert t["max_grade"] == 9 and t["median_sentence_words"] == min(art["targets"]["sentence_words"]["median"], 16)
    assert art["detector_patterns_block"] == out["detector_patterns_block"]
