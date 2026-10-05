"""Codex round-4 findings: trusted ACTIVE selector (signed, contained, slug + hash bound), exact-name tool
classification, and concurrent state writes."""
from __future__ import annotations

import json
import multiprocessing
import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO))
import medium_publish_guard as g  # noqa: E402
from guard_testutil import write_active  # noqa: E402
from test_medium_publish_guard import (BODY, bad, env, good_clip, ok, paste,  # noqa: E402,F401
                                       payload, receipts)

CLICK = payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"})
SHA = g._sha(BODY)


def ws_of(env):
    return Path(env["MEDIUM_GUARD_WORKSPACE"])


def key_of(env):
    return Path(env["MEDIUM_GUARD_RECORD_KEY"])


def pkg_of(env):
    return ws_of(env) / "articles" / "pkg1"


def active_path(env):
    return ws_of(env) / "release" / "ACTIVE.json"


def blocked_with(env, text):
    d = g.decide(CLICK, env, ok, good_clip)
    return (not d.allow) and text in d.reason


# ---- 1. untrusted ACTIVE selector ------------------------------------------------------------------
def test_valid_signed_active_is_accepted(env):
    assert g.decide(paste(), env, ok, good_clip).allow
    assert g.decide(CLICK, env, ok, good_clip).allow


def test_unsigned_active_blocks(env):
    doc = json.loads(active_path(env).read_text())
    doc.pop("hmac_sha256")
    active_path(env).write_text(json.dumps(doc))
    assert blocked_with(env, "unsigned")


@pytest.mark.parametrize("field,value", [("slug", "other"), ("content_sha256", "0" * 64), ("package", "/tmp/x")])
def test_edited_active_blocks(env, field, value):
    doc = json.loads(active_path(env).read_text())
    doc[field] = value
    active_path(env).write_text(json.dumps(doc))
    assert blocked_with(env, "signature invalid")


def test_active_signed_with_another_key_blocks(env, tmp_path):
    other = tmp_path / "other.key"
    other.write_text("11" * 32)
    other.chmod(0o600)
    write_active(ws_of(env), other, pkg_of(env), SHA)
    assert blocked_with(env, "signature invalid")


def test_record_key_must_be_private_and_present(env):
    key_of(env).chmod(0o644)
    assert blocked_with(env, "group/world accessible")
    key_of(env).chmod(0o600)
    key_of(env).unlink()
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_package_outside_workspace_blocks(env, tmp_path):
    outside = tmp_path / "elsewhere"
    (outside / "release").mkdir(parents=True)
    (outside / "release" / "medium-final.md").write_text(BODY)
    write_active(ws_of(env), key_of(env), outside, SHA, slug="elsewhere")
    assert blocked_with(env, "outside the workspace")


def test_package_symlink_escape_blocks(env, tmp_path):
    outside = tmp_path / "elsewhere"
    (outside / "release").mkdir(parents=True)
    (outside / "release" / "medium-final.md").write_text(BODY)
    link = ws_of(env) / "articles" / "linked"
    link.symlink_to(outside)
    write_active(ws_of(env), key_of(env), pkg_of(env), SHA, slug="linked", package=str(link))
    assert blocked_with(env, "outside the workspace")


def test_traversal_and_relative_package_block(env):
    write_active(ws_of(env), key_of(env), pkg_of(env), SHA, package=str(ws_of(env) / "articles" / ".." / ".." / "x"))
    assert blocked_with(env, "without '..'")
    write_active(ws_of(env), key_of(env), pkg_of(env), SHA, package="pkg1")
    assert blocked_with(env, "absolute path")


def test_workspace_itself_is_not_a_package(env):
    write_active(ws_of(env), key_of(env), ws_of(env), SHA, slug=ws_of(env).name)
    assert blocked_with(env, "outside the workspace")


def test_slug_mismatch_blocks(env):
    write_active(ws_of(env), key_of(env), pkg_of(env), SHA, slug="not-pkg1")
    assert blocked_with(env, "differs from the package slug")


def test_slug_comes_from_version_json(env):
    (pkg_of(env) / "version.json").write_text(json.dumps({"slug": "alpha"}))
    assert blocked_with(env, "differs from the package slug")  # ACTIVE says pkg1
    write_active(ws_of(env), key_of(env), pkg_of(env), SHA, slug="alpha")
    assert g.decide(CLICK, env, ok, good_clip).allow is False  # no receipt yet, but the selector is now accepted
    assert g.decide(paste(), env, ok, good_clip).allow


def test_content_hash_mismatch_with_verifier_blocks(env):
    write_active(ws_of(env), key_of(env), pkg_of(env), "a" * 64)
    assert blocked_with(env, "ACTIVE content_sha256 differs")


def test_active_without_slug_or_hash_blocks(env):
    doc = {"package": str(pkg_of(env).resolve())}
    import hashlib
    import hmac
    canon = json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    doc["hmac_sha256"] = hmac.new(key_of(env).read_bytes().strip(), canon, hashlib.sha256).hexdigest()
    active_path(env).write_text(json.dumps(doc))
    assert blocked_with(env, "lacks a slug or content_sha256")


def test_release_write_active_is_signed_and_guard_compatible(tmp_path, monkeypatch):
    """release.write_active output verifies with the guard's independent implementation."""
    from scripts.fingerprint_eval import release
    from scripts.fingerprint_eval.contracts import PackageCtx
    ws = tmp_path / "ws"
    pkg = ws / "articles" / "alpha"
    pkg.mkdir(parents=True)
    key = tmp_path / "record.key"
    key.write_text("ab" * 32)
    key.chmod(0o600)
    monkeypatch.setenv("FINGERPRINT_EVAL_WORKSPACE", str(ws))
    monkeypatch.setenv("FINGERPRINT_EVAL_KEY_FILE", str(key))
    ctx = PackageCtx(package=pkg, slug="alpha", final_path=pkg / "a.md", final_rule="test", reference_path=None, source_notes=None)
    path = release.write_active(ctx, "c" * 64)
    doc = json.loads(path.read_text())
    assert doc["slug"] == "alpha" and doc["content_sha256"] == "c" * 64 and doc["package"] == str(pkg.resolve())
    env = {"MEDIUM_GUARD_TEST_MODE": "1", "MEDIUM_GUARD_RECORD_KEY": str(key)}
    assert g.verify_active_sig(env, doc) == ""
    doc["slug"] = "evil"
    assert "signature invalid" in g.verify_active_sig(env, doc)



# ---- 2. unknown tool classification ----------------------------------------------------------------
MUTATING_UNKNOWN = ["evil__browser_snapshot", "mcp__x__browser_click", "mcp__x__browser_snapshot", "vision_analyze",
                    "browser_snapshot_v2", "Browser_snapshot", "browser_snapshot ", "totally_new_tool", "mcp__fs__read_file",
                    "read_file2", "my_read_file", "click_anything"]
SAFE = ["read_file", "search_files", "memory", "todo", "skill_view", "web_search", "write_file", "patch"]


@pytest.mark.parametrize("tool", MUTATING_UNKNOWN)
def test_unknown_tool_is_a_mutation(tool, env):
    p = payload(tool, {"a": 1})
    assert g.classify(p, env)[0] is True
    assert g.could_mutate(p) is True
    assert not g.decide(p, env, bad).allow          # release does not verify
    assert not g.decide(p, env, ok, good_clip).allow  # valid ACTIVE but no full-paste receipt
    assert g.decide(paste(), env, ok, good_clip).allow
    assert g.decide(p, env, ok, good_clip).allow     # receipt exists: same as any verified mutation


@pytest.mark.parametrize("tool", MUTATING_UNKNOWN)
def test_unknown_tool_blocked_when_active_invalid(tool, env):
    active_path(env).unlink()
    assert not g.decide(payload(tool, {}), env, ok, good_clip).allow
    assert g.decide(paste(), env, ok, good_clip).allow is False


@pytest.mark.parametrize("tool", SAFE)
def test_safe_listed_tools_pass_without_release(tool, env):
    active_path(env).unlink()
    p = payload(tool, {"path": "/tmp/notes.txt", "query": "hello"})
    assert g.classify(p, env) == (False, "")
    assert g.decide(p, env, bad).allow
    assert g.could_mutate(p) is False


def test_safe_listed_tool_mentioning_medium_is_conservative_on_error_path(env):
    assert g.could_mutate(payload("read_file", {"path": "/x/medium-final.md"})) is True


def test_namespaced_variant_of_a_read_tool_is_not_read_only(env):
    assert g.classify(payload("browser_snapshot", {}), env) == (False, "")
    assert g.classify(payload("evil__browser_snapshot", {}), env)[0] is True


# ---- 3. concurrent state writers -------------------------------------------------------------------
def _writer(args):
    env, sessions = args
    for s in sessions:
        g._remember_url(env, s, f"https://example.com/{s}")


def test_two_concurrent_writers_lose_no_updates(env):
    ctx = multiprocessing.get_context("fork")
    a = [f"a{i}" for i in range(25)]
    b = [f"b{i}" for i in range(25)]
    with ctx.Pool(2) as pool:
        pool.map(_writer, [(env, a), (env, b)])
    state = g._load_state(env)  # signature must also still be valid
    assert set(a + b) <= set(state)


def test_many_concurrent_writers_state_stays_signed(env):
    ctx = multiprocessing.get_context("fork")
    with ctx.Pool(6) as pool:
        pool.map(_writer, [(env, [f"w{n}_{i}" for i in range(8)]) for n in range(6)])
    assert len(g._load_state(env)) == 48


def test_state_lock_blocks_second_holder_and_times_out(env):
    with g.state_lock(env):
        with pytest.raises(g.StateError):
            with g.state_lock(env, timeout_s=0.2):
                pass
    with g.state_lock(env, timeout_s=0.2):
        pass


def test_unobtainable_state_lock_blocks_medium_navigation(env, monkeypatch):
    def boom(*a, **k):
        raise g.StateError("lock held")
    monkeypatch.setattr(g, "state_lock", boom)
    d = g.decide(payload("browser_navigate", {"url": "https://medium.com/new-story"}), env, ok, good_clip)
    assert not d.allow
