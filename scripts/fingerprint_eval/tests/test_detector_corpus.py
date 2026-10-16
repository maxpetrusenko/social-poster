import json
from pathlib import Path

import pytest

from scripts.fingerprint_eval import detector_corpus as DC
from scripts.fingerprint_eval import patterns as P

FIX = Path(__file__).parent / "fixtures"
NOW = "2026-10-16T00:00:00+00:00"


def rows(path):
    return [json.loads(x) for x in Path(path).read_text().splitlines() if x]


def ingest(tmp_path, detector, name, **kw):
    return DC.ingest(detector, FIX / name, corpus=tmp_path / "c.jsonl", now=NOW, **kw)


def test_gptzero_paste_sections_and_impact_lines(tmp_path):
    ingest(tmp_path, "gptzero", "gptzero_paste.txt", article_sha="abc")
    r = rows(tmp_path / "c.jsonl")
    flagged = [x["sentence"] for x in r if x["label"] == "flagged"]
    human = [x["sentence"] for x in r if x["label"] == "human"]
    assert "I've seen versions of this problem in software." in flagged
    assert "The evidence doesn't support that whole sequence." in flagged
    assert "The tool lets a manager decide immediately, at scale, and without having to make difficult judgments." in flagged
    assert "Ford needed experienced people." in human and len(human) == 5 and len(flagged) == 7
    assert all(x["detector"] == "gptzero" and x["article_sha"] == "abc" and x["ingested_at"] == NOW for x in r)
    assert not any("(98% AI)" in x["sentence"] or x["sentence"].startswith(('"', "1.")) for x in r)


def test_winston_sections_driving_score(tmp_path):
    ingest(tmp_path, "winston", "winston_paste.txt")
    r = rows(tmp_path / "c.jsonl")
    assert len(r) == 5 and {x["label"] for x in r} == {"flagged"} and all("article_sha" not in x for x in r)
    assert r[0]["sentence"].startswith("So the whole thing hinges")


def test_ingest_is_deduplicated_across_runs_and_detectors(tmp_path):
    a = ingest(tmp_path, "gptzero", "gptzero_paste.txt")
    b = ingest(tmp_path, "gptzero", "gptzero_paste.txt")
    assert a["added"] == 12 and b["added"] == 0 and b["skipped"] == 12
    assert len(rows(tmp_path / "c.jsonl")) == 12


def test_json_input_is_accepted(tmp_path):
    f = tmp_path / "p.json"
    f.write_text(json.dumps({"flagged": ["One flagged sentence here."], "human": ["One human sentence here."]}))
    DC.ingest("winston", f, corpus=tmp_path / "c.jsonl", now=NOW)
    assert [(x["label"], x["detector"]) for x in rows(tmp_path / "c.jsonl")] == [("flagged", "winston"), ("human", "winston")]


def test_unknown_detector_is_rejected(tmp_path):
    with pytest.raises(ValueError):
        DC.ingest("turnitin", FIX / "winston_paste.txt", corpus=tmp_path / "c.jsonl")


def test_cli_ingest(tmp_path, capsys):
    rc = DC.main(["ingest", "--detector", "winston", "--file", str(FIX / "winston_paste.txt"), "--article-sha", "s1", "--corpus", str(tmp_path / "c.jsonl")])
    assert rc == 0 and json.loads(capsys.readouterr().out)["added"] == 5
    assert rows(tmp_path / "c.jsonl")[0]["article_sha"] == "s1"


def test_recent_flagged_and_corpus_echo(tmp_path):
    c = tmp_path / "c.jsonl"
    DC.ingest("winston", FIX / "winston_paste.txt", corpus=c, now=NOW)
    DC.ingest("gptzero", FIX / "gptzero_paste.txt", corpus=c, now="2026-10-17T00:00:00+00:00")
    recent = DC.recent_flagged(5, corpus=c)
    assert len(recent) == 5 and all(isinstance(s, str) for s in recent)
    gz = [r["sentence"] for r in rows(c) if r["detector"] == "gptzero" and r["label"] == "flagged"]
    assert recent == list(reversed(gz))[:5]  # newest batch first (gptzero was ingested last), later rows first within it; no older winston row yet
    assert recent[0].startswith("The tool lets a manager decide immediately")
    echo = P.corpus_echo("Intro. The logic of the bet is that a pile that size only works. Other words here.", corpus=c)
    assert echo["count"] >= 5 and echo["examples"]
    assert P.corpus_echo("Nothing in common with the corpus at all.", corpus=c)["count"] == 0
    assert P.corpus_echo("anything", corpus=tmp_path / "missing.jsonl")["count"] == 0
