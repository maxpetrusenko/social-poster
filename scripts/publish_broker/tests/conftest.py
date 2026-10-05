"""Shared fixtures. The broker runs against the REAL release authorize/verify code in-process with the fingerprint_eval
Fakes (no models, no network), signing with a throwaway broker eval key. Nothing touches ~/.config or a real Medium."""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from unittest import mock

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

from scripts.fingerprint_eval import release  # noqa: E402
from scripts.fingerprint_eval.tests.fakes import ARTICLE, Fakes  # noqa: E402
from scripts.publish_broker.broker import Broker  # noqa: E402
from scripts.publish_broker.config import BrokerConfig  # noqa: E402
from scripts.publish_broker.runner import VerifyResult  # noqa: E402

PIN = "a" * 40
UID = os.getuid()


class InProcessRunner:
    """Same contract as SubprocessRunner, but calls the canonical release code directly with stubbed models."""

    def __init__(self, key_file: Path) -> None:
        self.key_file, self.sha, self.clean, self.authorize_calls = key_file, PIN, True, 0

    def head(self):
        return self.sha, self.clean

    def _env(self, ws: Path):
        return mock.patch.dict(os.environ, {"FINGERPRINT_EVAL_KEY_FILE": str(self.key_file), "FINGERPRINT_EVAL_WORKSPACE": str(ws)})

    def authorize(self, ws: Path, package: Path):
        self.authorize_calls += 1
        lines: list[str] = []
        with self._env(ws), Fakes():
            rc = release.authorize(package, out=lines.append)
        return rc, "\n".join(lines)

    def verify(self, ws: Path, package: Path):
        with self._env(ws):
            ok, why, sha = release.verify_package_detail(package)
        return VerifyResult(ok, why, sha)


@dataclass
class World:
    broker: Broker
    runner: InProcessRunner
    cfg: BrokerConfig
    workspace: Path
    clock: list

    def req(self, **kw):
        return self.broker.handle_raw(json.dumps({"v": 1, **kw}).encode(), UID)

    def authorize(self, package="alpha"):
        r = self.req(op="authorize", package=package)
        assert r["ok"], r
        return r["result"]

    def publish(self, auth_id, action="draft", **kw):
        return self.req(op="publish", auth_id=auth_id, action=action, **kw)

    def auth_path(self, auth_id):
        return self.cfg.store_dir / "auth" / f"{auth_id}.json"


def make_package(root: Path, slug="alpha", article=ARTICLE) -> Path:
    pkg = root / "articles" / slug
    pkg.mkdir(parents=True)
    (pkg / "version.json").write_text(json.dumps({"slug": slug, "articleFile": "article-v1.md"}))
    (pkg / "article-v1.md").write_text(article)
    (pkg / "article-medium.md").write_text(article + "\n")
    return pkg


@pytest.fixture()
def world(tmp_path):
    ws = tmp_path / "agent-workspace"
    make_package(ws)
    cfg = BrokerConfig(store_dir=tmp_path / "store", workspace_root=ws, pinned_checkout=REPO, pinned_sha=PIN,
                       socket_path=tmp_path / "b.sock", allowed_uids=(UID,), max_action="schedule")
    cfg.store_dir.mkdir(mode=0o700)
    clock = [1_000_000.0]
    # The runner needs the key file path before the Broker exists; Broker creates it 0600 on init.
    runner = InProcessRunner(cfg.store_dir / "keys" / "eval.key")
    broker = Broker(cfg, runner, clock=lambda: clock[0])
    return World(broker, runner, cfg, ws, clock)
