#!/usr/bin/env python3
"""Run the installed guard (subprocess, exactly as Hermes would) against canned payloads.

The installed guard FILE is copied into a throwaway pinned directory (its own config.json with a stub verifier
path + sha256, manifest and key), so the real installed state, key and receipts are never touched and the guard
needs no env overrides (it ignores them outside tests). Before that, the INSTALLED directory itself is checked:
guard hash equals its manifest entry, and the pinned verifier (absolute, user-owned, sha256 match) is valid.

Cases (exit 1 on any wrong decision):
  no ACTIVE -> click blocked, read allowed;
  ACTIVE, no full-paste receipt -> click, type, other keys, unknown browser tool, non-editor Medium nav BLOCKED;
      exact editor nav and cmd+a, read-only browser tool ALLOWED;
  ACTIVE + signed full receipt -> click allowed; tampered / unsigned receipt -> blocked; state unwritable -> blocked.
Round 4: unsigned / edited / out-of-workspace (symlink escape) / slug-mismatch / hash-mismatch ACTIVE -> blocked;
  namespaced or opaque unknown tools (evil__browser_snapshot, mcp__x__browser_click, vision_analyze) blocked unless
  ACTIVE + receipt, safe-listed tools (read_file, memory, todo) allowed; concurrent sessions all land in url memory.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import hmac
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
BODY_SHA = hashlib.sha256(BODY.encode()).hexdigest()


def pl(tool: str, args: dict) -> dict:
    return {"tool_name": tool, "session_id": "selftest", "tool_input": args}


CLICK = pl("computer_use", {"action": "click", "element": 1, "app": "GStack Browser"})
TYPE = pl("computer_use", {"action": "type", "text": "hello", "app": "GStack Browser"})
KEY_TAB = pl("computer_use", {"action": "key", "keys": "tab", "app": "GStack Browser"})
SELECT_ALL = pl("computer_use", {"action": "key", "keys": "cmd+a", "app": "GStack Browser"})
NAV = pl("browser_navigate", {"url": "https://medium.com/new-story"})
NAV_SUBMIT = pl("browser_navigate", {"url": "https://medium.com/p/abc123/submission?x=1"})
UNKNOWN_BROWSER = pl("browser_evaluate_script", {"code": "document.title"})
READ = pl("computer_use", {"action": "capture"})
SNAPSHOT = pl("browser_snapshot", {})
NS_SNAPSHOT = pl("evil__browser_snapshot", {})
MCP_CLICK = pl("mcp__x__browser_click", {"ref": "e1"})
VISION = pl("vision_analyze", {"image": "x.png"})
READ_FILE = pl("read_file", {"path": "/tmp/x"})
MEMORY = pl("memory", {"action": "list"})
TODO = pl("todo", {"items": []})


def main(dest_arg: str) -> int:
    tmp = Path(tempfile.mkdtemp(prefix="guard-selftest-"))
    try:
        return _run(Path(dest_arg), tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _sha_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _write_active(ws: Path, rkey: Path, pkg: Path, sha: str, slug: str = "pkg1", sign: bool = True, **over) -> None:
    """ACTIVE.json as `release authorize` writes it: record.py HMAC (canonical json minus hmac_sha256)."""
    doc = {"package": str(pkg.resolve()), "slug": slug, "content_sha256": sha, "activated_at_utc": "2026-01-01T00:00:00Z", **over}
    if sign:
        canon = json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
        doc["hmac_sha256"] = hmac.new(rkey.read_bytes().strip(), canon, hashlib.sha256).hexdigest()
    (ws / "release" / "ACTIVE.json").write_text(json.dumps(doc))


def _pinned_dir(root: Path, installed_guard: Path, ws: Path, uv: Path, state_is_file: bool = False,
                rkey: Path | None = None) -> Path:
    """A throwaway installed-style directory: guard copy, config (repo/workspace/uv + uv_sha256), manifest, key."""
    gd = root / "guards"
    gd.mkdir(parents=True)
    guard = gd / "medium_publish_guard.py"
    shutil.copyfile(installed_guard, guard)
    cfg = gd / "config.json"
    cfg.write_text(json.dumps({"repo": str(root), "workspace": str(ws), "uv": str(uv), "uv_sha256": _sha_file(uv),
                               "record_key": str(rkey or "")}))
    (gd / "manifest.sha256").write_text(f"{_sha_file(guard)}  medium_publish_guard.py\n{_sha_file(cfg)}  config.json\n")
    key = gd / "key"
    key.write_text("cd" * 32)
    key.chmod(0o400)
    if state_is_file:
        (gd / "state").write_text("x")
    return gd


def _run(dest: Path, tmp: Path) -> int:
    guard = dest / "medium_publish_guard.py"
    results: list[tuple[str, int, int]] = []

    def check(name: str, got: int, want: int) -> None:
        results.append((name, got, want))
        print(f"{'ok  ' if got == want else 'FAIL'} {name}: exit {got}, expected {want}")

    for need in (guard, dest / "manifest.sha256", dest / "key", dest / "config.json"):
        if not need.exists():
            print(f"FAIL setup: {need} missing (run scripts/hermes/install_guard.sh)")
            return 1
    sys.dont_write_bytecode = True

    # 1. the installed directory itself: hash vs manifest, pinned verifier valid
    want_sha = ""
    for ln in (dest / "manifest.sha256").read_text().splitlines():
        parts = ln.split()
        if len(parts) == 2 and parts[1] == "medium_publish_guard.py":
            want_sha = parts[0]
    check("installed guard hash matches its manifest", 0 if _sha_file(guard) == want_sha else 1, 0)
    try:
        spec = importlib.util.spec_from_file_location("installed_guard", guard)
        inst = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(inst)  # type: ignore[union-attr]
        inst.write_receipt, inst._sha, inst.pinned_verifier  # noqa: B018 - the installed guard must expose these
    except BaseException as exc:  # noqa: BLE001
        print(f"FAIL setup: installed guard cannot be loaded as a guard ({type(exc).__name__}: {exc})")
        return 1
    try:
        inst.pinned_verifier({})
        pin_ok = 0
    except BaseException as exc:  # noqa: BLE001
        print(f"     pinned verifier problem: {exc}")
        pin_ok = 1
    check("installed config pins a valid verifier (absolute, user-owned, sha256 matches)", pin_ok, 0)

    # 2. behavior of the installed guard bytes in a throwaway pinned dir
    ws = tmp / "ws"
    pkg = ws / "articles" / "pkg1"
    (pkg / "release").mkdir(parents=True)
    (pkg / "release" / "medium-final.md").write_text(BODY)
    (ws / "release").mkdir()
    uv = tmp / "uv"
    uv.write_text("#!/bin/sh\necho '{\"valid\": true, \"content_sha256\": \"%s\", \"release_article_sha256\": \"%s\"}'\n"
                  % (BODY_SHA, BODY_SHA))
    uv.chmod(stat.S_IRWXU)
    rkey = tmp / "record.key"
    rkey.write_text("ef" * 32)
    rkey.chmod(0o600)
    gd = _pinned_dir(tmp / "ok", guard, ws, uv, rkey=rkey)
    tguard = gd / "medium_publish_guard.py"
    spec = importlib.util.spec_from_file_location("temp_guard", tguard)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    base = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(tmp), "MEDIUM_GUARD_LOG": str(tmp / "d.jsonl")}

    def run(payload: dict, guard_file: Path = tguard) -> int:
        return subprocess.run([sys.executable, str(guard_file)], input=json.dumps(payload), text=True,
                              capture_output=True, env=base, timeout=90).returncode

    check("no ACTIVE.json -> click blocked", run(CLICK), 2)
    check("no ACTIVE.json -> read-only capture allowed", run(READ), 0)

    _write_active(ws, rkey, pkg, BODY_SHA)
    for name, p in (("click", CLICK), ("type", TYPE), ("other key (tab)", KEY_TAB),
                    ("unknown browser tool", UNKNOWN_BROWSER), ("non-editor Medium navigation", NAV_SUBMIT)):
        check(f"ACTIVE, no full-paste receipt -> {name} blocked", run(p), 2)
    check("ACTIVE, no full-paste receipt -> exact editor navigation allowed", run(NAV), 0)
    check("ACTIVE, no full-paste receipt -> cmd+a allowed", run(SELECT_ALL), 0)
    check("ACTIVE, no full-paste receipt -> browser_snapshot (read-only) allowed", run(SNAPSHOT), 0)

    mod.write_receipt({}, pkg, "selftest", BODY, BODY_SHA, "full")
    check("ACTIVE + verified full-paste receipt -> click allowed", run(CLICK), 0)

    rpath = gd / "state" / "receipts.jsonl"
    good = rpath.read_text()
    rpath.write_text(good.replace('"session_id": "selftest"', '"session_id": "forged"'))  # edit breaks the HMAC
    check("tampered receipt (edited) -> click blocked", run(CLICK), 2)
    rpath.write_text(json.dumps({"rec": json.loads(good)["rec"]}) + "\n")  # unsigned
    check("unsigned receipt -> click blocked", run(CLICK), 2)
    rpath.write_text(good)

    # round 4: ACTIVE trust
    _write_active(ws, rkey, pkg, BODY_SHA, sign=False)
    check("unsigned ACTIVE -> click blocked", run(CLICK), 2)
    _write_active(ws, rkey, pkg, BODY_SHA)
    act = ws / "release" / "ACTIVE.json"
    good_active = act.read_text()
    act.write_text(good_active.replace('"slug": "pkg1"', '"slug": "other"'))
    check("edited ACTIVE (bad signature) -> click blocked", run(CLICK), 2)
    outside = tmp / "outside"
    (outside / "release").mkdir(parents=True)
    (outside / "release" / "medium-final.md").write_text(BODY)
    _write_active(ws, rkey, outside, BODY_SHA, slug="outside")
    check("signed ACTIVE naming a package outside the workspace -> click blocked", run(CLICK), 2)
    (ws / "articles" / "link").symlink_to(outside)
    _write_active(ws, rkey, pkg, BODY_SHA, slug="outside", package=str(ws / "articles" / "link"))
    check("signed ACTIVE naming a symlink escape -> click blocked", run(CLICK), 2)
    _write_active(ws, rkey, pkg, BODY_SHA, slug="not-the-package")
    check("ACTIVE slug differs from the package slug -> click blocked", run(CLICK), 2)
    _write_active(ws, rkey, pkg, hashlib.sha256(b"x").hexdigest())
    check("ACTIVE content_sha256 differs from verify --json -> click blocked", run(CLICK), 2)
    _write_active(ws, rkey, pkg, BODY_SHA)
    check("valid signed ACTIVE restored -> click allowed (receipt present)", run(CLICK), 0)

    # round 4: unknown tool classification
    unknowns = (("namespaced evil__browser_snapshot", NS_SNAPSHOT), ("mcp__x__browser_click", MCP_CLICK),
                ("opaque vision_analyze", VISION))
    for name, p in unknowns:
        check(f"{name} with ACTIVE + receipt -> allowed", run(p), 0)
    for name, p in (("read_file", READ_FILE), ("memory", MEMORY), ("todo", TODO)):
        check(f"safe-listed {name} -> allowed", run(p), 0)
    receipts_file = gd / "state" / "receipts.jsonl"
    saved_receipts = receipts_file.read_text()
    receipts_file.unlink()  # no receipt: unknown tools must block
    for name, p in unknowns:
        check(f"ACTIVE, no receipt -> {name} blocked", run(p), 2)
    check("ACTIVE, no receipt -> safe-listed read_file allowed", run(READ_FILE), 0)
    (ws / "release" / "ACTIVE.json").unlink()
    for name, p in unknowns:
        check(f"no ACTIVE -> {name} blocked", run(p), 2)
    check("no ACTIVE -> safe-listed memory allowed", run(MEMORY), 0)
    _write_active(ws, rkey, pkg, BODY_SHA)
    receipts_file.write_text(saved_receipts)

    # round 4: concurrent sessions must not lose each other's url memory
    mem = gd / "state" / "url-memory.json"
    if mem.exists():
        mem.unlink()
    sessions = [f"conc{i}" for i in range(12)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        rcs = list(ex.map(lambda sid: run({**NAV, "session_id": sid}), sessions))
    check("12 concurrent navigations all allowed", 0 if all(r == 0 for r in rcs) else 1, 0)
    try:
        kept = set(json.loads(mem.read_text())["data"])
    except (OSError, ValueError, KeyError):
        kept = set()
    check("12 concurrent sessions all present in signed url memory", 0 if set(sessions) <= kept else 1, 0)

    gd_bad = _pinned_dir(tmp / "badstate", guard, ws, uv, state_is_file=True, rkey=rkey)
    bad_guard = gd_bad / "medium_publish_guard.py"
    check("state dir unwritable -> Medium navigation blocked", run(NAV, bad_guard), 2)
    check("state dir unwritable -> click blocked (receipt unreadable)", run(CLICK, bad_guard), 2)

    bad = [r for r in results if r[1] != r[2]]
    print(f"guard selftest: {len(results) - len(bad)}/{len(results)} correct ({guard})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else str(Path.home() / ".hermes" / "guards")))
