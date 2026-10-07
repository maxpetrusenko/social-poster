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
    pkg.mkdir(parents=True, exist_ok=True)
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


BLOCKS = (
    "# Title line\n\n"
    "### Subtitle line.\n\n"
    "![A hero alt](assets/hero.jpg)\n\n"
    "First sentence here. Second sentence with [a link](https://example.com/x) inside.\n\n"
    "## A heading\n\n"
    "> Quoted one. Quoted two.\n\n"
    "- item one\n- item two\n"
)


def test_units_split_per_block_and_keep_kind():
    u = CMP.units(BLOCKS)
    assert u[0] == {"kind": "heading", "level": 1, "text": "Title line"}
    assert u[1] == {"kind": "heading", "level": 3, "text": "Subtitle line."}
    assert u[2] == {"kind": "image", "text": "A hero alt"}
    assert [x["text"] for x in u if x["kind"] == "paragraph"] == ["First sentence here.", "Second sentence with a link inside."]
    heading = [x for x in u if x["text"] == "A heading"]
    assert heading == [{"kind": "heading", "level": 2, "text": "A heading"}]  # never glued to the previous sentence
    assert [x["text"] for x in u if x["kind"] == "quote"] == ["Quoted one.", "Quoted two."]
    assert [x["text"] for x in u if x["kind"] == "list"] == ["item one", "item two"]
    assert not any("](" in x["text"] or x["text"].startswith(">") for x in u)


def test_diff_ops_carry_units_with_kind():
    ops = CMP.diff_ops(CMP.units("## Same\n\nOld one."), CMP.units("## Same\n\nNew one."))
    assert [o["op"] for o in ops] == ["equal", "replace"]
    assert ops[0]["a"] == [{"kind": "heading", "level": 2, "text": "Same"}]
    assert ops[1]["a"][0]["kind"] == "paragraph" and ops[1]["b"][0]["text"] == "New one."


def test_banner_stripped_before_measuring_and_recorded(tmp_path):
    from scripts.write_pipeline.core import not_ready_banner
    banner = f"> NOT READY. {not_ready_banner('critic: budget exhausted')}\n\n"
    plain = _package(tmp_path / "a", final=CLEAN)
    bannered = _package(tmp_path / "b", final=banner + CLEAN)
    docs = []
    for i, pkg in enumerate((plain, bannered)):
        out = tmp_path / f"fp{i}.json"
        assert CMP.main(["--package", str(pkg), "--out", str(out)]) == 0
        docs.append(json.loads(out.read_text()))
    assert docs[0]["stripped"] == []
    assert docs[1]["stripped"] == [{"stage": "final", "path": "FINAL.md", "kind": "not_ready_banner", "text": banner.strip()}]
    assert docs[1]["stages"]["final"]["contract"] == docs[0]["stages"]["final"]["contract"]
    assert docs[1]["stages"]["final"]["n_words"] == docs[0]["stages"]["final"]["n_words"]
    assert all(o["op"] == "equal" for o in docs[1]["diffs"]["draft"]["ops"])  # no inserted banner text


def test_banner_pattern_is_exact(tmp_path):
    from scripts.write_pipeline.core import strip_not_ready_banner
    text = "> NOT READY. Something else entirely.\n\nBody."
    assert strip_not_ready_banner(text) == (text, None)
    quote = "> NOT READY. Do not publish. This article did not pass the pipeline (x).\n\n> a real quote\n"
    assert strip_not_ready_banner(quote)[0] == "> a real quote\n"


def test_edit_lists_drop_link_urls(tmp_path):
    pkg = _package(tmp_path)
    (pkg / "write-pipeline" / "removals-ledger.json").write_text(json.dumps({"entries": [
        {"stage": "repair", "sentence": "See [Annie Duke](https://example.com/a) won.", "reason": "r", "replacement": "[Annie Duke](https://example.com/a) won *more*."}]}))
    doc = CMP.compare(pkg)
    assert doc["edits"]["kept"][0]["sentence"] == "See Annie Duke won."
    assert doc["edits"]["kept"][0]["replacement"] == "Annie Duke won more."
