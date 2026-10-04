"""Fixtures mirror the real Hermes pre_tool_call stdin (agent/shell_hooks.py _payload_fields) and the
computer_use / browser_* / terminal argument shapes from hermes-agent tool schemas."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import medium_publish_guard as g  # noqa: E402

BODY = "# Title\n\nA long released paragraph that is definitely longer than forty characters in total.\n"


def payload(tool, args, session="s1"):
    return {"hook_event_name": "pre_tool_call", "tool_name": tool, "tool_input": args, "session_id": session,
            "cwd": "/x", "profile": "default", "extra": {"task_id": "t", "tool_call_id": "c"}}


@pytest.fixture()
def env(tmp_path):
    ws = tmp_path / "ws"
    pkg = ws / "articles" / "pkg1"
    (pkg / "release").mkdir(parents=True)
    (pkg / "release" / "medium-final.md").write_text(BODY)
    (ws / "release").mkdir()
    (ws / "release" / "ACTIVE.json").write_text(json.dumps({"package": "pkg1"}))
    return {"MEDIUM_GUARD_WORKSPACE": str(ws), "MEDIUM_GUARD_STATE": str(tmp_path / "state.json"),
            "MEDIUM_GUARD_REPO": str(tmp_path)}


ok = lambda pkg, env: (0, "")  # noqa: E731
bad = lambda pkg, env: (1, "content hash mismatch")  # noqa: E731

MUTATIONS = {
    "cu_click": payload("computer_use", {"action": "click", "element": 7, "app": "Google Chrome for Testing"}),
    "cu_click_frontmost": payload("computer_use", {"action": "click", "element": 7}),
    "cu_type": payload("computer_use", {"action": "type", "text": "Title", "app": "GStack Browser"}),
    "cu_paste": payload("computer_use", {"action": "key", "keys": "cmd+v", "app": "Google Chrome for Testing"}),
    "cu_set_value": payload("computer_use", {"action": "set_value", "element": 3, "value": "Oct"}),
    "nav_new_story": payload("browser_navigate", {"url": "https://medium.com/new-story"}),
    "nav_edit": payload("browser_navigate", {"url": "https://medium.com/p/a6ee8afb8283/edit"}),
    "nav_submission": payload("browser_navigate", {"url": "https://medium.com/p/a6ee8afb8283/submission?x=1"}),
    "term_goto_edit": payload("terminal", {"command": "$B goto https://medium.com/p/abc123/edit"}),
    "term_curl_post": payload("terminal", {"command": "curl -X POST https://medium.com/_/api/posts -d @x.json"}),
    "term_osascript": payload("terminal", {"command": "osascript -e 'tell app \"System Events\" to keystroke \"v\" using command down'"}),
    "term_pbcopy": payload("terminal", {"command": "pbcopy < /tmp/other.md"}),
}

READS = {
    "cu_capture": payload("computer_use", {"action": "capture", "mode": "som"}),
    "cu_scroll": payload("computer_use", {"action": "scroll", "direction": "down"}),
    "cu_click_finder": payload("computer_use", {"action": "click", "element": 1, "app": "Finder"}),
    "nav_stats": payload("browser_navigate", {"url": "https://medium.com/me/stats"}),
    "nav_stories": payload("browser_navigate", {"url": "https://medium.com/me/stories/public"}),
    "nav_read": payload("browser_navigate", {"url": "https://medium.com/@someone/some-post-1234abcd5678"}),
    "nav_other": payload("browser_navigate", {"url": "https://news.ycombinator.com"}),
    "snapshot": payload("browser_snapshot", {}),
    "term_ls": payload("terminal", {"command": "ls data/article-workspace"}),
    "term_curl_get": payload("terminal", {"command": "curl -s https://medium.com/@someone/post-1234abcd5678"}),
    "term_goto_stats": payload("terminal", {"command": "$B goto https://medium.com/me/stats && $B text"}),
    "term_goto_other_click": payload("terminal", {"command": "$B goto https://reddit.com && $B click @e3"}),
}


@pytest.mark.parametrize("name", MUTATIONS)
def test_mutation_denied_without_active_release(name, tmp_path):
    env = {"MEDIUM_GUARD_WORKSPACE": str(tmp_path), "MEDIUM_GUARD_STATE": str(tmp_path / "s.json")}
    d = g.decide(MUTATIONS[name], env, ok)
    assert not d.allow and "no active release" in d.reason


@pytest.mark.parametrize("name", MUTATIONS)
def test_mutation_denied_when_verify_fails(name, env):
    d = g.decide(MUTATIONS[name], env, bad)
    assert not d.allow and "release verify failed" in d.reason


@pytest.mark.parametrize("name", [n for n in MUTATIONS if n != "term_pbcopy"])
def test_mutation_allowed_with_valid_release(name, env):
    assert g.decide(MUTATIONS[name], env, ok).allow


@pytest.mark.parametrize("name", READS)
def test_read_only_allowed_even_without_release(name, tmp_path):
    env = {"MEDIUM_GUARD_WORKSPACE": str(tmp_path), "MEDIUM_GUARD_STATE": str(tmp_path / "s.json")}
    assert g.decide(READS[name], env, bad).allow


def test_stale_release_denied(env):
    d = g.decide(MUTATIONS["cu_paste"], env, lambda p, e: (1, "evaluator version changed"))
    assert not d.allow and "evaluator version changed" in d.reason


def test_verify_timeout_or_missing_uv_denied(env):
    assert not g.decide(MUTATIONS["cu_click"], env, lambda p, e: (124, "timed out")).allow
    assert not g.decide(MUTATIONS["cu_click"], env, lambda p, e: (127, "no uv")).allow


def test_active_names_missing_dir_denied(env):
    Path(env["MEDIUM_GUARD_WORKSPACE"], "release", "ACTIVE.json").write_text('{"package": "ghost"}')
    assert not g.decide(MUTATIONS["cu_click"], env, ok).allow


def test_active_corrupt_denied(env):
    Path(env["MEDIUM_GUARD_WORKSPACE"], "release", "ACTIVE.json").write_text("{nope")
    assert not g.decide(MUTATIONS["cu_click"], env, ok).allow


def test_browser_click_after_medium_navigation(env):
    assert g.decide(payload("browser_navigate", {"url": "https://medium.com/me/stats"}), env, bad).allow
    assert not g.decide(payload("browser_click", {"ref": "@e1"}), env, bad).allow
    assert g.decide(payload("browser_click", {"ref": "@e1"}, session="s2"), env, bad).allow
    g.decide(payload("browser_navigate", {"url": "https://example.com"}), env, bad)
    assert g.decide(payload("browser_click", {"ref": "@e1"}), env, bad).allow


def test_terminal_browse_click_after_goto_medium(env):
    g.decide(payload("terminal", {"command": "$B goto https://medium.com/me/stats"}), env, bad)
    assert not g.decide(payload("terminal", {"command": "$B click @e3"}), env, bad).allow


def test_typed_text_must_be_release_bytes(env):
    long_ok = payload("computer_use", {"action": "type", "app": "GStack Browser",
                                       "text": "A long released paragraph that is definitely longer than forty characters in total."})
    long_bad = payload("computer_use", {"action": "type", "app": "GStack Browser",
                                        "text": "Something the gate never evaluated, written fresh by the agent."})
    short = payload("computer_use", {"action": "type", "app": "GStack Browser", "text": "10:30"})
    assert g.decide(long_ok, env, ok).allow
    assert not g.decide(long_bad, env, ok).allow
    assert g.decide(short, env, ok).allow


def test_pbcopy_must_source_release(env):
    assert not g.decide(MUTATIONS["term_pbcopy"], env, ok).allow
    good = payload("terminal", {"command": "pbcopy < data/article-workspace/articles/pkg1/release/medium-final.md"})
    assert g.decide(good, env, ok).allow


def run_main(p, env, verifier):
    return g.main(io.StringIO(p if isinstance(p, str) else json.dumps(p)), env, verifier)


def test_main_exit_codes(env, capsys):
    assert run_main(MUTATIONS["cu_click"], env, ok) == 0
    assert run_main(MUTATIONS["cu_click"], env, bad) == 2
    out = capsys.readouterr()
    assert json.loads(out.out)["action"] == "block" and "mutation blocked" in out.err
    assert run_main(READS["cu_capture"], env, bad) == 0


def test_garbage_payload_fails_closed(env):
    assert run_main("not json", env, ok) == 2
    assert run_main("[1,2]", env, ok) == 2


def test_guard_crash_denied_for_mutation_like(env, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("kaput")
    monkeypatch.setattr(g, "decide", boom)
    assert run_main(MUTATIONS["cu_click"], env, ok) == 2
    assert run_main(payload("terminal", {"command": "curl https://medium.com/new-story"}), env, ok) == 2
    assert run_main(payload("terminal", {"command": "ls"}), env, ok) == 0


def test_state_write_failure_does_not_break(env):
    env["MEDIUM_GUARD_STATE"] = "/proc/nope/x.json"
    assert g.decide(READS["nav_stats"], env, bad).allow
