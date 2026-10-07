import hashlib
import json

from scripts.write_pipeline import compare as CMP

CLEAN = (
    "# A small test\n\n"
    "I kept a notebook on the kitchen table for a year. It held the prices I paid for bread, and little else.\n\n"
    "By spring the pattern was plain. Bread cost more on Fridays, and I had been shopping on Fridays.\n\n"
    "So I moved my shopping to Tuesday and wrote the new prices beside the old ones.\n"
)
WORSE = (
    "# A small test\n\n"
    "Here's the thing: it's not about bread, it's about attention. Furthermore, moreover, additionally, it is crucial to note this.\n\n"
    "Here's the thing: it's not about prices, it's about habits. Furthermore, moreover, additionally, it is crucial to note this.\n\n"
    "Here's the thing: it's not about Tuesday, it's about control. Furthermore, moreover, additionally, it is crucial to note this.\n"
)


def _package(tmp_path, final=WORSE):
    pkg = tmp_path / "pkg"
    art = pkg / "write-pipeline" / "artifacts"
    art.mkdir(parents=True)
    (art / "06-draft.md").write_text(CLEAN)
    (art / "09-voice.md").write_text(CLEAN)
    (art / "13-images.reference-frame.md").write_text(CLEAN)
    (pkg / "FINAL.md").write_text(final)
    (pkg / "write-pipeline" / "state.json").write_text(json.dumps({"slug": "t", "repair_cuts": [{"text": "Cut me.", "reason": "unsupported"}], "fingerprint_rejections": {}}))
    (pkg / "write-pipeline" / "removals-ledger.json").write_text(json.dumps({"entries": [{"stage": "repair", "sentence": "Cut me.", "reason": "unsupported"}]}))
    (pkg / "write-pipeline" / "log.jsonl").write_text(json.dumps({"event": "repair_rejected", "at": "t0", "reasons": ["claims gate failed"]}) + "\n")
    return pkg


def _tree_hash(pkg):
    return {str(p.relative_to(pkg)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pkg.rglob("*")) if p.is_file()}


def test_schema_and_never_writes_into_package(tmp_path):
    pkg = _package(tmp_path)
    before = _tree_hash(pkg)
    out = tmp_path / "out" / "fingerprint.json"
    assert CMP.main(["--package", str(pkg), "--out", str(out)]) == 0
    assert _tree_hash(pkg) == before
    doc = json.loads(out.read_text())
    assert doc["schema"] == 1 and doc["package_sha"]
    assert set(doc["stages"]) == {"draft", "voice", "frame", "final"}
    for st in doc["stages"].values():
        assert {"path", "sha256", "n_words", "contract", "author"} <= set(st)
        assert "composite" in st["contract"] and "values" in st["author"] and "distance" in st["author"]
    assert set(doc["diffs"]) == {"draft", "voice", "frame"}
    assert {o["op"] for o in doc["diffs"]["draft"]["ops"]} <= {"equal", "insert", "delete", "replace"}
    assert doc["edits"]["kept"] == [{"stage": "repair", "sentence": "Cut me.", "reason": "unsupported"}]
    assert doc["edits"]["rejected"] == [{"stage": "repair", "at": "t0", "reasons": ["claims gate failed"]}]


def test_worse_final_is_a_bad_direction_delta(tmp_path):
    pkg = _package(tmp_path)
    out = tmp_path / "fp.json"
    assert CMP.main(["--package", str(pkg), "--out", str(out)]) == 0
    doc = json.loads(out.read_text())
    delta = doc["stages"]["final"]["contract"]["composite"] - doc["stages"]["draft"]["contract"]["composite"]
    assert doc["bad_direction"]["composite"] == "high" and delta > 0
    assert doc["bad_direction"]["burstiness"] == "low"
    assert doc["bad_direction"]["author_distance"] == "high"


def test_missing_stage_fails_open_exit_code(tmp_path):
    pkg = _package(tmp_path)
    (pkg / "FINAL.md").unlink()
    assert CMP.main(["--package", str(pkg), "--out", str(tmp_path / "x.json")]) == 1
    assert not (tmp_path / "x.json").exists()
