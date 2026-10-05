#!/usr/bin/env python3
"""Run the installed guard (subprocess, exactly as Hermes would) against canned payloads.

Cases: no ACTIVE -> block; ACTIVE + verified paste receipt -> allow click; tampered receipt -> block;
state dir unwritable -> block; plus a read-only call -> allow. Exit 1 on any wrong decision.

The release verifier is stubbed through the guard's existing MEDIUM_GUARD_UV knob (a script that exits 0), so
this checks the guard's own logic, integrity check, key and signing, not the fingerprint evaluator.
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

BODY = "# Title\n\nA long released paragraph that is definitely longer than forty characters in total.\n"
CLICK = {"tool_name": "computer_use", "session_id": "selftest",
         "tool_input": {"action": "click", "element": 1, "app": "GStack Browser"}}
NAV = {"tool_name": "browser_navigate", "session_id": "selftest",
       "tool_input": {"url": "https://medium.com/new-story"}}
READ = {"tool_name": "computer_use", "session_id": "selftest", "tool_input": {"action": "capture"}}


def main(dest_arg: str) -> int:
    tmp = Path(tempfile.mkdtemp(prefix="guard-selftest-"))
    try:
        return _run(Path(dest_arg), tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _run(dest: Path, tmp: Path) -> int:
    guard = dest / "medium_publish_guard.py"
    for need in (guard, dest / "manifest.sha256", dest / "key"):
        if not need.exists():
            print(f"FAIL setup: {need} missing (run scripts/hermes/install_guard.sh)")
            return 1
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location("installed_guard", guard)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        mod.write_receipt, mod._sha  # noqa: B018 - the installed guard must expose the receipt API
    except BaseException as exc:  # noqa: BLE001
        print(f"FAIL setup: installed guard cannot be loaded as a guard ({type(exc).__name__}: {exc})")
        return 1

    ws = tmp / "ws"
    pkg = ws / "articles" / "pkg1"
    (pkg / "release").mkdir(parents=True)
    (pkg / "release" / "medium-final.md").write_text(BODY)
    (ws / "release").mkdir()
    stub = tmp / "uv"
    stub.write_text("#!/bin/sh\nexit 0\n")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    state = tmp / "state"
    env = {**os.environ, "MEDIUM_GUARD_DIR": str(dest), "MEDIUM_GUARD_WORKSPACE": str(ws),
           "MEDIUM_GUARD_STATE_DIR": str(state), "MEDIUM_GUARD_UV": str(stub), "MEDIUM_GUARD_REPO": str(tmp),
           "MEDIUM_GUARD_LOG": str(tmp / "decisions.jsonl")}
    env.pop("HERMES_HOME", None)

    def run(payload: dict, e: dict) -> int:
        return subprocess.run([sys.executable, str(guard)], input=json.dumps(payload), text=True,
                              capture_output=True, env=e, timeout=60).returncode

    results: list[tuple[str, int, int]] = []

    def check(name: str, got: int, want: int) -> None:
        results.append((name, got, want))
        print(f"{'ok  ' if got == want else 'FAIL'} {name}: exit {got}, expected {want}")

    check("no ACTIVE.json -> click blocked", run(CLICK, env), 2)
    check("no ACTIVE.json -> read-only capture allowed", run(READ, env), 0)

    (ws / "release" / "ACTIVE.json").write_text(json.dumps({"package": "pkg1"}))
    sha = mod._sha(BODY.encode())
    mod.write_receipt(env, pkg, "selftest", BODY, sha, "full")
    check("ACTIVE + verified paste receipt -> click allowed", run(CLICK, env), 0)

    rpath = state / "receipts.jsonl"
    good = rpath.read_text()
    rpath.write_text(good.replace('"session_id": "selftest"', '"session_id": "forged"'))  # edit breaks the HMAC
    check("tampered receipt (edited) -> click blocked", run(CLICK, env), 2)
    rpath.write_text(json.dumps({"rec": json.loads(good)["rec"]}) + "\n")  # unsigned
    check("unsigned receipt -> click blocked", run(CLICK, env), 2)
    rpath.write_text(good)

    blocker = tmp / "not-a-dir"
    blocker.write_text("x")
    env_bad = {**env, "MEDIUM_GUARD_STATE_DIR": str(blocker / "state")}
    check("state dir unwritable -> Medium navigation blocked", run(NAV, env_bad), 2)
    check("state dir unwritable -> click blocked (receipt unreadable)", run(CLICK, env_bad), 2)

    bad = [r for r in results if r[1] != r[2]]
    print(f"guard selftest: {len(results) - len(bad)}/{len(results)} correct ({guard})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else str(Path.home() / ".hermes" / "guards")))
