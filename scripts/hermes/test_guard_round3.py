"""Codex round-3 findings: browser tools default to mutation, nothing but editor navigation / cmd+a / the full
paste before a verified full-paste receipt, TOCTOU (verify --json hash + flock + single read), verifier pinning,
and an allowlisted subprocess environment."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import stat
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import medium_publish_guard as g  # noqa: E402
from test_medium_publish_guard import (BODY, EDIT_URL, bad, env, good_clip, ok, paste, payload,  # noqa: E402,F401
                                       receipts, verify_json)


def pkg_of(env):
    return Path(env["MEDIUM_GUARD_WORKSPACE"]) / "articles" / "pkg1"


# ---- 1. unknown browser tools fail closed -----------------------------------------------------------
UNKNOWN_BROWSER = ["browser_evaluate", "browser_brand_new_tool", "browser_back", "browser_hover", "browser_fill_form",
                   "browser_upload", "browser_select", "browser_tab_close", "mcp__playwright__browser_click",
                   "mcp__playwright__browser_run_code", "playwright_click", "chrome_devtools_press",
                   "puppeteer_evaluate", "desktop_mouse_move", "keyboard_hotkey", "webdriver_execute",
                   "evil__browser_snapshot", "mcp__playwright__browser_snapshot"]
READ_BROWSER = ["browser_snapshot", "browser_vision", "browser_get_images", "browser_screenshot", "browser_capture",
                "browser_get_text", "browser_list", "browser_list_tabs", "browser_wait", "browser_scroll"]


@pytest.mark.parametrize("tool", UNKNOWN_BROWSER)
def test_unknown_browser_tool_is_a_mutation(tool, env):
    p = payload(tool, {"anything": 1})
    assert g.classify(p, env)[0] is True
    d = g.decide(p, env, bad)
    assert not d.allow and d.mutation
    d = g.decide(p, env, ok, good_clip)
    assert not d.allow and "full-paste receipt" in d.reason  # even with a valid release, before the paste
    assert g.could_mutate(p) is True


@pytest.mark.parametrize("tool", UNKNOWN_BROWSER)
def test_unknown_browser_tool_blocked_with_no_active_release(tool, tmp_path):
    from guard_testutil import install_fake_guard
    e = {"MEDIUM_GUARD_WORKSPACE": str(tmp_path), **install_fake_guard(tmp_path)}
    assert not g.decide(payload(tool, {}), e, ok).allow


@pytest.mark.parametrize("tool", READ_BROWSER)
def test_read_only_allowlist_passes(tool, env):
    assert g.classify(payload(tool, {}), env) == (False, "")
    assert g.decide(payload(tool, {}), env, bad).allow
    assert g.could_mutate(payload(tool, {})) is False


def test_opaque_non_browser_tool_is_a_mutation_round4(env):
    assert not g.decide(payload("vision_analyze", {"image": "x.png"}), env, bad).allow


# ---- 2. before an exact full paste: editor navigation, Enter on a typed editor URL, cmd+a, full paste ----
def cu(action, **kw):
    return payload("computer_use", {"action": action, "app": "GStack Browser", **kw})


PRE_BLOCKED = {
    "click": cu("click", element=3),
    "double_click": cu("double_click", element=3),
    "drag": cu("drag", coordinate=[1, 2]),
    "type_text": cu("type", text="hello"),
    "type_release_fragment": cu("type", text="A long released paragraph that is definitely longer than forty characters in total."),
    "key_tab": cu("key", keys="tab"),
    "key_cmd_x": cu("key", keys="cmd+x"),
    "key_enter": cu("key", keys="return"),
    "browser_click": payload("browser_click", {"ref": "@e1"}),
    "browser_type_url": payload("browser_type", {"ref": "@e1", "text": EDIT_URL}),
    "browser_press_tab": payload("browser_press", {"key": "Tab"}),
    "browser_console": payload("browser_console", {"expression": "document.title"}),
    "nav_other_write_page": payload("browser_navigate", {"url": "https://medium.com/p/a6ee8afb8283/submission?x=1"}),
    "nav_editor_with_query": payload("browser_navigate", {"url": EDIT_URL + "?x=1"}),
    "nav_editor_http": payload("browser_navigate", {"url": "http://medium.com/new-story"}),
    "nav_other_draft": payload("browser_navigate", {"url": "https://medium.com/p/ffffffff/edit"}),
    "goto_other_draft": payload("terminal", {"command": "$B goto https://medium.com/p/ffffffff/edit"}),
    "goto_plus_click": payload("terminal", {"command": "$B goto https://medium.com/new-story && $B click @e1"}),
}


@pytest.mark.parametrize("name", PRE_BLOCKED)
def test_blocked_before_full_paste_receipt(name, env):
    d = g.decide(PRE_BLOCKED[name], env, ok, good_clip)
    assert not d.allow, name
    assert receipts(env) == []


PRE_ALLOWED = {
    "nav_new_story": payload("browser_navigate", {"url": "https://medium.com/new-story"}),
    "nav_recorded_draft": payload("browser_navigate", {"url": EDIT_URL}),
    "goto_new_story": payload("terminal", {"command": "$B goto https://medium.com/new-story"}),
    "cmd_a": cu("key", keys="cmd+a"),
    "cmd_a_browser_press": payload("browser_press", {"key": "Meta+a"}),
}


@pytest.mark.parametrize("name", PRE_ALLOWED)
def test_allowed_before_full_paste_receipt(name, env):
    assert g.decide(PRE_ALLOWED[name], env, ok, good_clip).allow


def test_bootstrap_sequence_keyboard_only_then_everything_unlocks(env):
    sel = cu("key", keys="cmd+a")
    assert g.decide(PRE_ALLOWED["nav_new_story"], env, ok, good_clip).allow
    assert g.decide(sel, env, ok, good_clip).allow
    assert not g.decide(PRE_BLOCKED["click"], env, ok, good_clip).allow  # no click even to focus the editor
    assert g.decide(paste(), env, ok, good_clip).allow
    assert g.decide(PRE_BLOCKED["click"], env, ok, good_clip).allow
    assert receipts(env)[0]["kind"] == "full"


def test_no_workflow_json_means_only_new_story(env):
    (pkg_of(env) / "workflow.json").unlink()
    assert not g.decide(PRE_ALLOWED["nav_recorded_draft"], env, ok, good_clip).allow
    assert g.decide(PRE_ALLOWED["nav_new_story"], env, ok, good_clip).allow


def test_only_draft_or_edit_keyed_editor_urls_are_trusted(env):
    (pkg_of(env) / "workflow.json").write_text(json.dumps(
        {"notes": "https://medium.com/p/abcdef12/edit", "x": {"draftUrl": "https://evil.example/p/abcdef12/edit"}}))
    assert not g.decide(payload("browser_navigate", {"url": "https://medium.com/p/abcdef12/edit"}), env, ok).allow
    (pkg_of(env) / "workflow.json").write_text(json.dumps({"medium": {"draftUrl": "https://medium.com/p/abcdef12/edit"}}))
    assert g.decide(payload("browser_navigate", {"url": "https://medium.com/p/abcdef12/edit"}), env, ok).allow


def test_receipt_for_another_session_does_not_lift_the_preflight(env):
    assert g.decide(paste(session="A"), env, ok, good_clip).allow
    assert not g.decide(payload("computer_use", {"action": "click", "element": 1, "app": "GStack Browser"}, "B"),
                        env, ok, good_clip).allow


def test_exact_bytes_comparison_no_rstrip_no_normalisation(env):
    for clip in (BODY.rstrip(), BODY + "\n", BODY.rstrip() + "  ", BODY.encode() + b"\n"):
        assert not g.decide(paste(session="x"), env, ok, lambda e, c=clip: (c, None, "")).allow
    assert g.decide(paste(session="x"), env, ok, lambda e: (BODY.encode(), None, "")).allow


def test_non_utf8_clipboard_bytes_do_not_match(env):
    assert not g.decide(paste(), env, ok, lambda e: (BODY.encode() + b"\xff", None, "")).allow


# ---- 3. TOCTOU ---------------------------------------------------------------------------------------
def test_verify_json_hash_must_match_release_bytes(env):
    other = hashlib.sha256(b"something else").hexdigest()
    v = lambda pkg, e: (0, verify_json(pkg, sha=other))  # noqa: E731
    d = g.decide(paste(), env, v, good_clip)
    assert not d.allow and "differs from the hash release verify vouched for" in d.reason
    assert receipts(env) == []


@pytest.mark.parametrize("out", ["", "not json", "[]", json.dumps({"valid": False, "content_sha256": "a" * 64}),
                                 json.dumps({"valid": True}), json.dumps({"valid": True, "content_sha256": "zz"}),
                                 json.dumps({"valid": True, "content_sha256": "a" * 64, "release_article_sha256": "b" * 64})])
def test_malformed_or_negative_verify_json_blocks(out, env):
    d = g.decide(paste(), env, lambda pkg, e: (0, out), good_clip)
    assert not d.allow and "verify output rejected" in d.reason


def test_release_changed_between_verify_and_read_blocks(env):
    rel = pkg_of(env) / "release" / "medium-final.md"

    def verify_then_swap(pkg, e):
        out = verify_json(pkg)  # vouches for BODY ...
        rel.write_text(BODY + "swapped after verify\n")  # ... then the file changes before the guard reads it
        return 0, out

    d = g.decide(paste(), env, verify_then_swap, lambda e: ((BODY + "swapped after verify\n").encode(), None, ""))
    assert not d.allow and "changed after verify" in d.reason


def test_release_file_is_read_exactly_once_after_verify(env, monkeypatch):
    rel = pkg_of(env) / "release" / "medium-final.md"
    reads = []
    real = Path.read_bytes

    def counting(self):
        if self == rel:
            reads.append(1)
        return real(self)

    def verifier(pkg, e):  # the stub's own hashing read happens before the guard's read; count the guard's only
        out = verify_json(pkg)
        reads.clear()
        return 0, out

    monkeypatch.setattr(Path, "read_bytes", counting)
    monkeypatch.setattr(Path, "read_text", lambda self, *a, **k: real(self).decode() if self != rel else pytest.fail("re-read"))
    assert g.decide(paste(), env, verifier, good_clip).allow
    assert len(reads) == 1


def test_lock_is_held_across_verify_and_comparison(env):
    lock = pkg_of(env) / "release" / ".guard.lock"
    seen = {}

    def verifier(pkg, e):
        fd = os.open(lock, os.O_RDWR)
        try:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                seen["verify"] = "free"
            except BlockingIOError:
                seen["verify"] = "held"
        finally:
            os.close(fd)
        return ok(pkg, e)

    def clip(e):
        fd = os.open(lock, os.O_RDWR)
        try:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                seen["compare"] = "free"
            except BlockingIOError:
                seen["compare"] = "held"
        finally:
            os.close(fd)
        return good_clip(e)

    assert g.decide(paste(), env, verifier, clip).allow
    assert seen == {"verify": "held", "compare": "held"}
    fd = os.open(lock, os.O_RDWR)  # released afterwards
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    os.close(fd)


def test_unobtainable_lock_blocks(env, monkeypatch):
    def nolock(*a, **k):
        raise g.StateError("cannot lock")
    monkeypatch.setattr(g, "release_lock", nolock)
    assert not g.decide(paste(), env, ok, good_clip).allow


def test_run_verify_asks_for_json(env, tmp_path, monkeypatch):
    uv = tmp_path / "uv"
    uv.write_text("#!/bin/sh\necho \"$@\" > %s/args\necho '{\"valid\": true, \"content_sha256\": \"%s\"}'\n" % (tmp_path, "a" * 64))
    uv.chmod(stat.S_IRWXU)
    env = {**env, "MEDIUM_GUARD_UV": str(uv), "MEDIUM_GUARD_REPO": str(tmp_path)}
    rc, out = g.run_verify(pkg_of(env), env)
    assert rc == 0 and json.loads(out)["valid"] is True
    argv = (tmp_path / "args").read_text()
    assert "verify --package" in argv and argv.strip().endswith("--json")


# ---- 4. verifier pinning ----------------------------------------------------------------------------
def _stub_uv(tmp_path, body="echo '{}'\n"):
    uv = tmp_path / "pinned-uv"
    uv.write_text("#!/bin/sh\n" + body)
    uv.chmod(stat.S_IRWXU)
    return uv


def _pin(env, uv, repo, sha=None):
    gd = Path(env["MEDIUM_GUARD_DIR"])
    cfg = gd / "config.json"
    cfg.write_text(json.dumps({"repo": str(repo), "workspace": env["MEDIUM_GUARD_WORKSPACE"], "uv": str(uv),
                               "uv_sha256": sha or hashlib.sha256(Path(uv).read_bytes()).hexdigest()}))
    (gd / "manifest.sha256").write_text(
        (gd / "manifest.sha256").read_text().splitlines()[0] + f"\n{g._sha(cfg.read_bytes())}  config.json\n")


def prod_env(env, monkeypatch):
    """Simulate production: not under pytest, no TEST_MODE. The guard dir stays reachable via the file location."""
    monkeypatch.delitem(sys.modules, "pytest")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    return env


def test_test_mode_needs_flag_and_pytest(env, monkeypatch):
    assert g.test_mode(env) is True
    assert g.test_mode({k: v for k, v in env.items() if k != "MEDIUM_GUARD_TEST_MODE"}) is False
    assert g.test_mode({**env, "MEDIUM_GUARD_TEST_MODE": "0"}) is False
    prod_env(env, monkeypatch)
    assert g.test_mode(env) is False  # flag set but not under pytest


def test_env_overrides_ignored_in_production(env, tmp_path, monkeypatch):
    evil = _stub_uv(tmp_path)
    e = {**env, "MEDIUM_GUARD_UV": str(evil), "MEDIUM_GUARD_REPO": str(tmp_path), "MEDIUM_GUARD_DIR": str(tmp_path / "x"),
         "MEDIUM_GUARD_STATE_DIR": str(tmp_path / "s"), "MEDIUM_GUARD_WORKSPACE": str(tmp_path / "w")}
    prod_env(e, monkeypatch)
    assert g.guard_dir(e) != tmp_path / "x"
    assert g.state_dir(e) != tmp_path / "s"
    assert g.workspace(e) != tmp_path / "w"
    with pytest.raises(g.StateError):
        g.pinned_verifier(e)  # no pinned verifier in config and the env override is ignored
    rc, why = g.run_verify(tmp_path, e)
    assert rc == 127 and "pins no verifier" in why


def test_pinned_config_is_used_and_checked(env, tmp_path):
    uv = _stub_uv(tmp_path)
    e = {k: v for k, v in env.items() if k != "MEDIUM_GUARD_TEST_MODE"} | {"MEDIUM_GUARD_TEST_MODE": "1"}
    _pin(e, uv, tmp_path)
    assert g.pinned_verifier(e) == (str(uv), tmp_path)
    uv.write_text("#!/bin/sh\necho swapped\n")  # content changes after install
    with pytest.raises(g.StateError, match="pinned sha256"):
        g.pinned_verifier(e)


def test_verifier_must_be_absolute_and_user_owned(env, tmp_path, monkeypatch):
    uv = _stub_uv(tmp_path)
    _pin(env, "relative/uv", tmp_path, sha="a" * 64)
    with pytest.raises(g.StateError, match="not an absolute path"):
        g.pinned_verifier({k: v for k, v in env.items() if k != "MEDIUM_GUARD_UV"})
    _pin(env, uv, tmp_path)
    uv.chmod(0o777)  # group/world writable
    with pytest.raises(g.StateError, match="writable"):
        g.pinned_verifier(env)
    uv.chmod(stat.S_IRWXU)
    monkeypatch.setattr(g.os, "getuid", lambda: os.stat(uv).st_uid + 1)  # a different owner
    with pytest.raises(g.StateError, match="not owned"):
        g.pinned_verifier(env)


def test_test_override_is_also_checked(env, tmp_path):
    with pytest.raises(g.StateError, match="not an absolute path"):
        g.pinned_verifier({**env, "MEDIUM_GUARD_UV": "uv", "MEDIUM_GUARD_REPO": str(tmp_path)})


def test_repo_must_be_user_owned_dir(env, tmp_path):
    uv = _stub_uv(tmp_path)
    _pin(env, uv, tmp_path / "nope")
    with pytest.raises(g.StateError, match="repo rejected"):
        g.pinned_verifier({k: v for k, v in env.items() if k != "MEDIUM_GUARD_REPO"})


# ---- 5. secrets: allowlisted subprocess env -----------------------------------------------------------
SECRETS = {"OPENAI_API_KEY": "sk-secret", "ANTHROPIC_API_KEY": "sk-ant", "GITHUB_TOKEN": "ghp_x",
           "DOPPLER_TOKEN": "dp.st.x", "LLM_GATEWAY_API_KEY": "gw", "AWS_SECRET_ACCESS_KEY": "aws",
           "HERMES_MATRIX_TOKEN": "m"}


def test_sub_env_allowlist(monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("UV_CACHE_DIR", "/tmp/uvc")
    out = g.sub_env({**SECRETS, "MEDIUM_GUARD_UV": "/x"})
    assert set(out) <= set(g.SUBPROCESS_ENV_KEYS)
    assert "PATH" in out and out["UV_CACHE_DIR"] == "/tmp/uvc"
    assert not set(out) & set(SECRETS)


def test_uv_subprocess_gets_no_secrets(env, tmp_path, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    dump = tmp_path / "envdump"
    uv = _stub_uv(tmp_path, "env > %s\necho '{\"valid\": true, \"content_sha256\": \"%s\"}'\n" % (dump, "a" * 64))
    e = {**env, **SECRETS, "MEDIUM_GUARD_UV": str(uv), "MEDIUM_GUARD_REPO": str(tmp_path)}
    rc, _ = g.run_verify(pkg_of(env), e)
    assert rc == 0
    names = {ln.split("=", 1)[0] for ln in dump.read_text().splitlines() if "=" in ln}
    assert not names & set(SECRETS)
    assert "PATH" in names and "HOME" in names
    assert names <= set(g.SUBPROCESS_ENV_KEYS) | {"FINGERPRINT_EVAL_WORKSPACE", "PWD", "SHLVL", "_", "OLDPWD", "__CF_USER_TEXT_ENCODING"}


def test_pbpaste_and_osascript_get_no_secrets(env, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    seen = []

    class R:
        returncode, stderr = 0, ""

        def __init__(self, out):
            self.stdout = out

    def fake_run(cmd, **kw):
        seen.append((cmd[0], kw.get("env")))
        return R(b"x" if cmd[0] == "pbpaste" else "")

    monkeypatch.setattr(g.subprocess, "run", fake_run)
    g.read_clipboard({**env, **SECRETS})
    assert [c for c, _ in seen] == ["pbpaste", "osascript"]
    for _, e in seen:
        assert e is not None and set(e) <= set(g.SUBPROCESS_ENV_KEYS) and not set(e) & set(SECRETS)
