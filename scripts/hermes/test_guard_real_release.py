"""Guard against the REAL release CLI: package authorized by release.authorize (models stubbed with the
fingerprint_eval Fakes), then the guard shells out to `uv run --python 3.12 python -m
scripts.fingerprint_eval.release verify` exactly as in production. Evaluator version and author corpus are
the real ones, so the subprocess and the in-process authorize agree."""
from __future__ import annotations

import io
import json
import shutil
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import medium_publish_guard as g  # noqa: E402
from guard_testutil import install_fake_guard  # noqa: E402
from scripts.fingerprint_eval import release  # noqa: E402
from scripts.fingerprint_eval.tests.fakes import ARTICLE, Fakes  # noqa: E402

pytestmark = pytest.mark.skipif(not (shutil.which("uv") or (Path.home() / ".local/bin/uv").exists()), reason="uv missing")


@pytest.fixture()
def world(tmp_path, monkeypatch):
    ws = tmp_path / "ws"
    monkeypatch.setenv("FINGERPRINT_EVAL_WORKSPACE", str(ws))
    pkg = ws / "articles" / "alpha"
    pkg.mkdir(parents=True)
    (pkg / "version.json").write_text(json.dumps({"slug": "alpha", "articleFile": "article-v1.md"}))
    (pkg / "article-v1.md").write_text(ARTICLE)
    (pkg / "article-medium.md").write_text(ARTICLE + "\n")
    with Fakes():
        rc = release.authorize(pkg, out=lambda *a: None)
    assert rc == 0, "authorize must PASS with stubbed models"
    env = {"FINGERPRINT_EVAL_WORKSPACE": str(ws), "MEDIUM_GUARD_REPO": str(REPO),
           **install_fake_guard(tmp_path)}
    return pkg, env


def call(p, env, clip):
    return g.main(io.StringIO(json.dumps(p)), env, None, clip)  # verifier=None -> real run_verify


def pl(tool, args, session="live"):
    return {"tool_name": tool, "tool_input": args, "session_id": session}


def test_real_verify_gates_navigation_paste_and_click(world):
    pkg, env = world
    release_text = (pkg / "release" / "medium-final.md").read_text()
    clip_ok = lambda e: (release_text, None, "")  # noqa: E731
    nav = pl("browser_navigate", {"url": "https://medium.com/new-story"})
    click = pl("computer_use", {"action": "click", "element": 1, "app": "GStack Browser"})
    paste = pl("computer_use", {"action": "key", "keys": "cmd+v", "app": "GStack Browser"})
    assert call(nav, env, clip_ok) == 0
    assert call(click, env, clip_ok) == 2          # no receipt yet
    assert call(paste, env, lambda e: ("other text " * 10, None, "")) == 2
    assert call(paste, env, clip_ok) == 0          # exact release bytes
    assert call(click, env, clip_ok) == 0          # receipt for this session
    receipts = (Path(env["MEDIUM_GUARD_STATE_DIR"]) / "receipts.jsonl").read_text().splitlines()
    assert len(receipts) == 1 and json.loads(receipts[0])["rec"]["kind"] == "full"


def test_article_changed_after_authorize_blocks_everything(world):
    pkg, env = world
    (pkg / "article-medium.md").write_text(ARTICLE + "\nedited after PASS\n")
    nav = pl("browser_navigate", {"url": "https://medium.com/new-story"})
    assert call(nav, env, lambda e: ("", None, "")) == 2


def test_no_active_marker_blocks(world):
    pkg, env = world
    (Path(env["FINGERPRINT_EVAL_WORKSPACE"]) / "release" / "ACTIVE.json").unlink()
    assert call(pl("browser_navigate", {"url": "https://medium.com/new-story"}), env, None) == 2
