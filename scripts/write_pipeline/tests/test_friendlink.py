"""Friend link step: recorded after publishing, never in FINAL.md, rendered only into the unbound paste copy under the hero caption."""
import hashlib
import json

import pytest

from scripts.write_pipeline import postpublish as PP
from scripts.write_pipeline.cli import main

URL = "https://medium.com/@max/some-story-abc123?sk=deadbeef1234"
FINAL = ("# Title\n\n### Sub\n\n![alt](assets/hero.jpg)\n\n*A hero caption.*\n\n**TL;DR** short.\n\nBody paragraph one.\n\n## Head\n\nMore.\n")
LINE = f"*Not a member? Read it free with my [friend link]({URL}).*"


@pytest.fixture
def pkg(tmp_path):
    (tmp_path / "FINAL.md").write_text(FINAL)
    return tmp_path


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def run(pkg, *args):
    return main(["postpublish", "friendlink", "--package", str(pkg), *args])


def test_valid_paywalled_records_prints_and_renders_under_caption(pkg, capsys):
    before = sha(pkg / "FINAL.md")
    assert run(pkg, "--url", URL, "--paywalled", "yes") == 0
    out = capsys.readouterr().out
    assert LINE in out and "directly under the hero image caption" in out
    rec = json.loads((pkg / "write-pipeline/postpublish.json").read_text())
    assert rec["friend_link"] == URL and rec["paywalled"] is True and rec["recorded_at"]
    paste = (pkg / "write-pipeline/paste-copy.md").read_text()
    assert "*A hero caption.*\n\n" + LINE + "\n\n**TL;DR**" in paste
    assert LINE in (pkg / "write-pipeline/paste-copy.html").read_text().replace("&amp;", "&") or "friend link" in (pkg / "write-pipeline/paste-copy.html").read_text()
    assert sha(pkg / "FINAL.md") == before and "friend" not in (pkg / "FINAL.md").read_text()  # hash-bound: never edited


@pytest.mark.parametrize("url", [
    "https://medium.com/@max/story-abc123",            # no token
    "https://medium.com/@max/story-abc123?sk=",        # empty token
    "https://example.com/story?sk=abc",                # not medium
    "http://medium.com/@max/story-abc123?sk=abc",      # not https
    "https://evilmedium.com/@max/s?sk=abc",            # lookalike host
    "https://medium.com/?sk=abc",                      # not a story
    "not a url", "",
])
def test_invalid_url_is_rejected_and_nothing_is_pasted(pkg, capsys, url):
    before = sha(pkg / "FINAL.md")
    assert run(pkg, "--url", url, "--paywalled", "yes") == 1
    assert "Not a member" not in capsys.readouterr().out
    rec = json.loads((pkg / "write-pipeline/postpublish.json").read_text())
    assert rec["friend_link"] is None and rec["omitted_reason"]
    assert not (pkg / "write-pipeline/paste-copy.md").exists() and sha(pkg / "FINAL.md") == before


def test_not_paywalled_omits_the_line_and_records_why(pkg, capsys):
    assert run(pkg, "--url", URL, "--paywalled", "no") == 0
    assert "Not a member" not in capsys.readouterr().out
    rec = json.loads((pkg / "write-pipeline/postpublish.json").read_text())
    assert rec["paywalled"] is False and "not paywalled" in rec["omitted_reason"]
    assert not (pkg / "write-pipeline/paste-copy.md").exists()


def test_missing_url_omits_and_records(pkg, capsys):
    assert run(pkg, "--paywalled", "no") == 0
    assert json.loads((pkg / "write-pipeline/postpublish.json").read_text())["friend_link"] is None


def test_export_renders_only_with_link_and_paywalled(pkg):
    assert PP.build_paste_copy(pkg) is None  # no record
    (pkg / "write-pipeline").mkdir()
    rec = pkg / "write-pipeline/postpublish.json"
    rec.write_text(json.dumps({"friend_link": URL, "paywalled": False, "recorded_at": "x"}))
    assert PP.build_paste_copy(pkg) is None
    rec.write_text(json.dumps({"friend_link": None, "paywalled": True, "recorded_at": "x"}))
    assert PP.build_paste_copy(pkg) is None
    rec.write_text(json.dumps({"friend_link": URL, "paywalled": True, "recorded_at": "x"}))
    assert LINE in PP.build_paste_copy(pkg).read_text()


def test_render_requires_a_hero_caption():
    with pytest.raises(ValueError):
        PP.render_paste_copy("# T\n\nno hero here\n", LINE)
    assert PP.render_paste_copy(FINAL, LINE).count(LINE) == 1


def test_source_never_calls_the_network():
    import inspect
    src = inspect.getsource(PP)
    assert "urllib.request" not in src and "requests" not in src and "socket" not in src
