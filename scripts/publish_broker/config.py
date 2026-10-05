"""Broker configuration, read from a JSON file owned by the broker user (e.g. ~mediumpub/etc/broker.json)."""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .schema import ACTIONS


@dataclass(frozen=True)
class BrokerConfig:
    store_dir: Path                 # broker-owned, 0700: keys/, snapshots/, auth/, audit.jsonl
    workspace_root: Path            # the publishing agent's article workspace; READ by the broker, never trusted
    pinned_checkout: Path           # broker-owned social-poster checkout the evaluator runs from
    pinned_sha: str                 # full commit sha that checkout must be at (clean) for authorize and publish
    socket_path: Path
    allowed_uids: tuple[int, ...]   # peer uids allowed to connect (the Hermes OS user)
    max_action: str = "draft"       # policy ceiling owned by the broker user: draft < schedule < publish
    auth_ttl_seconds: int = 3600
    max_package_bytes: int = 50 * 1024 * 1024
    max_package_files: int = 2000
    python_cmd: tuple[str, ...] = field(default_factory=lambda: (sys.executable,))
    pass_env: tuple[str, ...] = ()  # extra env var names forwarded to the evaluator subprocess (model credentials)

    def __post_init__(self) -> None:
        if self.max_action not in ACTIONS:
            raise ValueError(f"max_action must be one of {ACTIONS}")
        if len(self.pinned_sha) != 40 or any(c not in "0123456789abcdef" for c in self.pinned_sha):
            raise ValueError("pinned_sha must be a full 40-hex commit sha")
        if not self.allowed_uids:
            raise ValueError("allowed_uids must not be empty")

    @staticmethod
    def load(path: Path) -> "BrokerConfig":
        d = json.loads(Path(path).read_text())
        return BrokerConfig(
            store_dir=Path(d["store_dir"]), workspace_root=Path(d["workspace_root"]), pinned_checkout=Path(d["pinned_checkout"]),
            pinned_sha=d["pinned_sha"], socket_path=Path(d["socket_path"]), allowed_uids=tuple(int(u) for u in d["allowed_uids"]),
            max_action=d.get("max_action", "draft"), auth_ttl_seconds=int(d.get("auth_ttl_seconds", 3600)),
            max_package_bytes=int(d.get("max_package_bytes", 50 * 1024 * 1024)), max_package_files=int(d.get("max_package_files", 2000)),
            python_cmd=tuple(d.get("python_cmd") or (sys.executable,)), pass_env=tuple(d.get("pass_env", ())))
