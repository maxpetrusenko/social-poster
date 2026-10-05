"""Reference coverage: rhetoric the extractor confirms is claimless is recorded, not an error; promo lines are frozen."""
import json
import tempfile
from pathlib import Path

from scripts.fingerprint_eval import extract_cache
from scripts.fingerprint_eval.rewrite import segment_article
from scripts.fingerprint_eval.tests.fakes import Fakes

MD = ("# T\n\n## S\n\nThe reactor ran for forty days without a single fault. Here is the part that keeps the picture honest. "
      "The budget doubled in 2021 because of delays in shipping parts.\n")


def reply(prompt: str) -> str:
    numbered = prompt.split("Numbered sentences:\n", 1)[1].split("\n\nPassage:", 1)[0]
    if "[3]" in numbered:  # whole segment: the rhetorical sentence is skipped
        return json.dumps({"role": "r", "propositions": [{"claim": "The reactor ran for forty days without a fault.", "links": [], "sentence_ids": [1]},
                                                          {"claim": "The budget doubled in 2021 because of shipping delays.", "links": [], "sentence_ids": [3]}]})
    return json.dumps({"role": "r", "propositions": []})  # targeted re-extraction: no factual claim there


def test_claimless_gap_is_recorded_and_cached():
    f = Fakes()
    f.extract_reply = reply
    with f, tempfile.TemporaryDirectory() as d:
        cache = Path(d) / "x.json"
        segs = segment_article(MD)
        assert extract_cache.ensure_extraction(segs, MD, "claude:sonnet", cache) == "extracted"
        prose = [s for s in segs if not s.frozen]
        assert prose[0].nonfactual == [2]
        saved = json.loads(cache.read_text())
        assert saved["schema_version"] == extract_cache.SCHEMA_VERSION == 4 and list(saved["segments"].values())[0]["nonfactual"] == [2]
        calls = f.calls["extract"]
        segs2 = segment_article(MD)
        assert extract_cache.ensure_extraction(segs2, MD, "claude:sonnet", cache) == "cache"
        assert f.calls["extract"] == calls and [s for s in segs2 if not s.frozen][0].nonfactual == [2]


def test_promo_lines_are_frozen():
    md = "# T\n\n## S\n\nThe reactor ran for forty days without a single fault and nobody was surprised by it.\n\n---\n\nRead next: [Your Research Agent Has All the Right Tools](https://x.example/a)\n"
    assert [s.frozen for s in segment_article(md) if s.blocks[0].kind == "paragraph"] == [False, True]
    alone = "# T\n\n## S\n\nFor a useful next read, try [Scientists Have Confirmed What the Body Already Knew](https://x.example/b), another piece about the body.\n"
    assert all(s.frozen for s in segment_article(alone) if s.blocks[0].kind == "paragraph")
    plain = "# T\n\n## S\n\nRead next steps carefully before the reactor starts and log every reading you take today.\n"
    assert not [s for s in segment_article(plain) if s.frozen and s.blocks[0].kind == "paragraph"]
