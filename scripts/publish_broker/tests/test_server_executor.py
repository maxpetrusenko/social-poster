"""Socket round trip, peer-credential check, executor ordering (compare gates click), and the real subprocess runner."""
from __future__ import annotations

import os
import shutil
import stat
import sys
import tempfile
import threading
from pathlib import Path

import pytest

from scripts.publish_broker import client
from scripts.publish_broker.executor import DryRunEditor, compare_stub, execute
from scripts.publish_broker.runner import SubprocessRunner
from scripts.publish_broker.server import Server, peer_uid

from .conftest import REPO, UID


@pytest.fixture()
def sock_dir():
    d = tempfile.mkdtemp(prefix="pb", dir="/tmp")  # AF_UNIX paths are short on macOS
    yield Path(d)
    shutil.rmtree(d, ignore_errors=True)


def serve(world, sock_dir, n=1):
    srv = Server(world.broker, sock_dir / "b.sock")
    srv.bind()
    t = threading.Thread(target=lambda: [srv.serve_one() for _ in range(n)], daemon=True)
    t.start()
    return srv, t


def test_round_trip_over_the_socket_with_kernel_peer_uid(world, sock_dir):
    srv, t = serve(world, sock_dir, 3)
    assert stat.S_IMODE(os.stat(srv.path).st_mode) == 0o660
    r = client.request(srv.path, {"op": "status"})
    assert r["ok"] and r["result"]["executor"] == "dry-run"
    a = client.request(srv.path, {"op": "authorize", "package": "alpha"})
    assert a["ok"], a
    p = client.request(srv.path, {"op": "publish", "auth_id": a["result"]["auth_id"], "action": "draft"})
    assert p["ok"] and p["result"]["dry_run"] is True
    t.join(5)


def test_socket_rejects_content_and_wrong_uid(world, sock_dir):
    srv, t = serve(world, sock_dir, 2)
    r = client.request(srv.path, {"op": "authorize", "package": "alpha", "content": "# bytes"})
    assert r["error"]["code"] == "content_not_accepted"
    world.broker.cfg = type(world.cfg)(**{**world.cfg.__dict__, "allowed_uids": (UID + 12345,)})
    r = client.request(srv.path, {"op": "status"})
    assert r["error"]["code"] == "peer_not_allowed"
    t.join(5)


def test_peer_uid_reads_the_connecting_process_uid(sock_dir):
    import socket as s
    path = sock_dir / "p.sock"
    srv = s.socket(s.AF_UNIX)
    srv.bind(str(path))
    srv.listen(1)
    cli = s.socket(s.AF_UNIX)
    cli.connect(str(path))
    conn, _ = srv.accept()
    assert peer_uid(conn) == UID
    for x in (conn, cli, srv):
        x.close()


# ---- executor: compare gates the click ---------------------------------------------------------------------------------
class FakeEditor:
    dry_run = False

    def __init__(self, html):
        self.html, self.calls = html, []

    def paste(self, b): self.calls.append("paste")
    def read_back(self): self.calls.append("read_back"); return self.html
    def click(self, action, schedule_at): self.calls.append(f"click:{action}")


def test_click_only_after_compare_passes():
    ed = FakeEditor("<p>drifted</p>")
    out = execute(b"# hi", "publish", None, ed, lambda md, html: (False, ["paragraph 1 differs"]))
    assert out == {"ok": False, "diffs": ["paragraph 1 differs"], "compare_ran": True} and "click:publish" not in ed.calls
    ed = FakeEditor("<h1>hi</h1>")
    assert execute(b"# hi", "publish", None, ed, lambda md, html: (True, []))["ok"] and ed.calls == ["paste", "read_back", "click:publish"]


def test_unwired_comparator_fails_closed():
    ed = FakeEditor("<h1>hi</h1>")
    out = execute(b"# hi", "draft", None, ed, compare_stub)
    assert out["ok"] is False and "not wired" in out["diffs"][0] and "click:draft" not in ed.calls


def test_dry_run_editor_touches_nothing_and_records_plan():
    ed = DryRunEditor()
    out = execute(b"# hi", "draft", None, ed)
    assert out["compare_ran"] is False and [s["step"] for s in ed.steps] == ["paste", "read_back", "compare", "click"]


# ---- the real runner: pinned checkout + subprocess ------------------------------------------------------------------------
def test_subprocess_runner_verifies_what_the_in_process_authorize_wrote(world):
    a = world.authorize()
    snap = next((world.cfg.store_dir / "snapshots").iterdir()) / "ws"
    runner = SubprocessRunner(REPO, (sys.executable,), world.cfg.store_dir / "keys" / "eval.key")
    vr = runner.verify(snap, snap / "articles" / "alpha")
    assert vr.valid and vr.content_sha256 == a["content_sha256"], vr
    sha, _clean = runner.head()
    assert len(sha) == 40


def test_subprocess_runner_rejects_wrong_key(world, tmp_path):
    world.authorize()
    snap = next((world.cfg.store_dir / "snapshots").iterdir()) / "ws"
    other = tmp_path / "other.key"
    other.write_bytes(b"e" * 64)
    other.chmod(0o600)
    vr = SubprocessRunner(REPO, (sys.executable,), other).verify(snap, snap / "articles" / "alpha")
    assert not vr.valid and "signature" in vr.reason
