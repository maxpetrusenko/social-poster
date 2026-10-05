"""Throwaway pinned install of the Medium publish guard, plus simulated Hermes pre_tool_call payloads.

The guard file under test (the repo copy, or --guard <installed copy>) is copied into a private pinned directory
(config.json, manifest, key, state) exactly as scripts/hermes/install_guard.sh lays it out, but pointed at the case
workspace. The real ~/.hermes is never touched: HOME is a temp dir for the guard process.

The installed guard ignores env overrides outside pytest, so its clipboard check reads the REAL pbpaste. The rig sets
the real clipboard with pbcopy and restores the previous (plain-text) clipboard afterwards.
"""
from __future__ import annotations

import contextlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .sandbox import sha

REPO = Path(__file__).resolve().parents[3]
DEFAULT_GUARD = REPO / "scripts" / "hermes" / "medium_publish_guard.py"
APP = "GStack Browser"

# payload shapes copied from scripts/hermes/guard_selftest.py and the guard tests
NAV = {"tool_name": "browser_navigate", "tool_input": {"url": "https://medium.com/new-story"}}
PASTE = {"tool_name": "computer_use", "tool_input": {"action": "key", "keys": "cmd+v", "app": APP}}
CLICK = {"tool_name": "computer_use", "tool_input": {"action": "click", "element": 1, "app": APP}}
PUBLISH_CLICK = {"tool_name": "computer_use", "tool_input": {"action": "click", "element": 7, "app": APP}}  # a Publish/Schedule click is just an element click


def clipboard_available() -> bool:
    return bool(shutil.which("pbcopy") and shutil.which("pbpaste"))


@contextlib.contextmanager
def clipboard_restored():
    """Save the current plain-text clipboard, restore it on exit (rich/binary flavors cannot be preserved)."""
    prev = subprocess.run(["pbpaste"], capture_output=True, timeout=10).stdout if clipboard_available() else None
    try:
        yield
    finally:
        if prev is not None:
            subprocess.run(["pbcopy"], input=prev, timeout=10)


def set_clipboard(data: bytes) -> None:
    subprocess.run(["pbcopy"], input=data, check=True, timeout=10)


def _cmd(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, timeout=60).stdout.strip()


class GuardRig:
    """One pinned guard install bound to one workspace. `session` is unique per rig so receipts never leak between cases."""

    def __init__(self, root: Path, workspace: Path, record_key: Path, guard_file: Path | None = None, log: Path | None = None):
        self.root, self.workspace, self.record_key = root, workspace, record_key
        self.guard_src = (guard_file or DEFAULT_GUARD).resolve()
        self.home = root / "home"
        self.dir = root / "guards"
        self.log = log or root / "decisions.jsonl"
        self.session = f"dryrun-{root.name}"
        self.decisions: list[dict] = []
        self._install()

    def _install(self) -> None:
        uv = Path(shutil.which("uv") or Path.home() / ".local/bin/uv").resolve()
        self.dir.mkdir(parents=True)
        guard = self.dir / "medium_publish_guard.py"
        shutil.copyfile(self.guard_src, guard)
        cfg = self.dir / "config.json"
        cfg.write_text(json.dumps({"repo": str(REPO), "workspace": str(self.workspace), "uv": str(uv), "uv_sha256": sha(uv.read_bytes()),
                                   "record_key": str(self.home / ".config/fingerprint-eval/record.key")}, indent=2, sort_keys=True))
        (self.dir / "manifest.sha256").write_text(f"{sha(guard.read_bytes())}  medium_publish_guard.py\n{sha(cfg.read_bytes())}  config.json\n")
        (self.dir / "key").write_text(os.urandom(32).hex())
        (self.dir / "key").chmod(0o400)
        self.guard = guard
        # the record key release authorize signs with; the guard's verify subprocess finds it through the temp HOME
        self.home.mkdir(parents=True, exist_ok=True)
        self.record_key.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not self.record_key.exists():
            self.record_key.write_text(os.urandom(32).hex())
        self.record_key.chmod(0o600)

    def env(self) -> dict[str, str]:
        uv_cache = os.environ.get("UV_CACHE_DIR") or _cmd("uv", "cache", "dir")
        uv_py = os.environ.get("UV_PYTHON_INSTALL_DIR") or _cmd("uv", "python", "dir")
        e = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(self.home), "MEDIUM_GUARD_LOG": str(self.log)}
        for k in ("LANG", "USER", "TMPDIR"):  # pbpaste decodes by locale: without LANG a UTF-8 clipboard comes back mangled
            if k in os.environ:
                e[k] = os.environ[k]
        e.setdefault("LANG", "en_US.UTF-8")
        if uv_cache:
            e["UV_CACHE_DIR"] = uv_cache
        if uv_py:
            e["UV_PYTHON_INSTALL_DIR"] = uv_py
        return e

    def decide(self, step: str, payload: dict) -> dict:
        """Run the guard exactly as Hermes does: payload JSON on stdin, exit 2 = block."""
        body = {"hook_event_name": "pre_tool_call", "session_id": self.session, "cwd": str(REPO), **payload}
        p = subprocess.run([sys.executable, str(self.guard)], input=json.dumps(body), text=True, capture_output=True,
                           env=self.env(), timeout=150)
        reason = ""
        try:
            reason = json.loads(p.stdout).get("message", "") or json.loads(p.stdout).get("reason", "")
        except (ValueError, AttributeError):
            reason = (p.stderr or p.stdout).strip()
        d = {"step": step, "tool": payload["tool_name"], "exit": p.returncode, "decision": "allow" if p.returncode == 0 else "block",
             "reason": reason[:300]}
        self.decisions.append(d)
        return d

    def paste_with(self, step: str, clip: bytes, payload: dict = PASTE) -> dict:
        set_clipboard(clip)
        return self.decide(step, payload)
