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
from guard_testutil import install_fake_guard  # noqa: E402

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
    (pkg / "workflow.json").write_text(json.dumps({"medium": {"draft_edit_url": EDIT_URL}}))
    return {"MEDIUM_GUARD_WORKSPACE": str(ws), "MEDIUM_GUARD_REPO": str(tmp_path), **install_fake_guard(tmp_path)}


good_clip = lambda env: (BODY, None, "")  # noqa: E731
def verify_json(pkg, env=None, sha=None):
    """What `release verify --json` prints: the sha256 of the release bytes the verifier vouched for."""
    s = sha or g._sha((pkg / "release" / "medium-final.md").read_bytes())
    return json.dumps({"valid": True, "content_sha256": s, "release_article_sha256": s})


ok = lambda pkg, env: (0, verify_json(pkg))  # noqa: E731
bad = lambda pkg, env: (1, "content hash mismatch")  # noqa: E731
EDIT_URL = "https://medium.com/p/a6ee8afb8283/edit"

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
    env = {"MEDIUM_GUARD_WORKSPACE": str(tmp_path), **install_fake_guard(tmp_path)}
    d = g.decide(MUTATIONS[name], env, ok)
    assert not d.allow and "no active release" in d.reason


@pytest.mark.parametrize("name", MUTATIONS)
def test_mutation_denied_when_verify_fails(name, env):
    d = g.decide(MUTATIONS[name], env, bad)
    assert not d.allow and "release verify failed" in d.reason


NO_RECEIPT_OK = ["nav_new_story", "nav_edit"]  # exact editor URLs: new-story and workflow.json's draft edit URL
NEEDS_RECEIPT = ["cu_click", "cu_click_frontmost", "cu_set_value", "term_curl_post", "term_osascript", "cu_type"]
NAV_NEEDS_RECEIPT = ["nav_submission", "term_goto_edit"]  # Medium write pages that are NOT an exact editor URL


@pytest.mark.parametrize("name", NO_RECEIPT_OK)
def test_exact_editor_navigation_allowed_before_receipt(name, env):
    assert g.decide(MUTATIONS[name], env, ok, good_clip).allow


@pytest.mark.parametrize("name", NAV_NEEDS_RECEIPT)
def test_other_medium_write_navigation_blocked_before_receipt_allowed_after(name, env):
    d = g.decide(MUTATIONS[name], env, ok, good_clip)
    assert not d.allow and "exact editor URL" in d.reason
    assert g.decide(paste(), env, ok, good_clip).allow
    assert g.decide(MUTATIONS[name], env, ok, good_clip).allow


@pytest.mark.parametrize("name", NEEDS_RECEIPT)
def test_click_family_blocked_before_verified_paste_allowed_after(name, env):
    d = g.decide(MUTATIONS[name], env, ok, good_clip)
    assert not d.allow and "paste receipt" in d.reason
    paste = payload("computer_use", {"action": "key", "keys": "cmd+v", "app": "GStack Browser"})
    assert g.decide(paste, env, ok, good_clip).allow
    assert g.decide(MUTATIONS[name], env, ok, good_clip).allow


@pytest.mark.parametrize("name", READS)
def test_read_only_allowed_even_without_release(name, tmp_path):
    env = {"MEDIUM_GUARD_WORKSPACE": str(tmp_path), **install_fake_guard(tmp_path)}
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


def test_browser_click_is_a_mutation_on_any_page(env):
    assert g.decide(payload("browser_navigate", {"url": "https://medium.com/me/stats"}), env, bad).allow
    assert not g.decide(payload("browser_click", {"ref": "@e1"}), env, bad).allow
    assert not g.decide(payload("browser_click", {"ref": "@e1"}, session="s2"), env, bad).allow  # default is mutation
    g.decide(payload("browser_navigate", {"url": "https://example.com"}), env, bad)
    assert not g.decide(payload("browser_click", {"ref": "@e1"}), env, bad).allow
    assert g.decide(payload("browser_snapshot", {}), env, bad).allow


def test_terminal_browse_click_after_goto_medium(env):
    g.decide(payload("terminal", {"command": "$B goto https://medium.com/me/stats"}), env, bad)
    assert not g.decide(payload("terminal", {"command": "$B click @e3"}), env, bad).allow


def test_typed_text_must_be_release_bytes(env):
    typ = lambda t: payload("computer_use", {"action": "type", "app": "GStack Browser", "text": t})  # noqa: E731
    long_ok = typ("A long released paragraph that is definitely longer than forty characters in total.")
    long_bad = typ("Something the gate never evaluated, written fresh by the agent.")
    short = typ("10:30")
    assert not g.decide(long_ok, env, ok).allow and not g.decide(short, env, ok).allow  # no receipt yet
    assert g.decide(paste(), env, ok, good_clip).allow
    assert g.decide(long_ok, env, ok).allow
    assert not g.decide(long_bad, env, ok).allow
    assert g.decide(short, env, ok).allow


def test_pbcopy_must_source_release(env):
    assert not g.decide(MUTATIONS["term_pbcopy"], env, ok).allow
    good = payload("terminal", {"command": "pbcopy < data/article-workspace/articles/pkg1/release/medium-final.md"})
    assert g.decide(good, env, ok).allow  # clipboard load is allowed pre-receipt (the paste is byte-checked)
    assert g.decide(good, env, ok).allow


def run_main(p, env, verifier, clip=None):
    return g.main(io.StringIO(p if isinstance(p, str) else json.dumps(p)), env, verifier, clip)


def test_main_exit_codes(env, capsys):
    assert run_main(MUTATIONS["nav_edit"], env, ok) == 0
    assert run_main(MUTATIONS["nav_edit"], env, bad) == 2
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


def test_state_write_failure_on_clearly_non_medium_nav_passes(env, tmp_path):
    blocker = tmp_path / "afile"
    blocker.write_text("x")
    env["MEDIUM_GUARD_STATE_DIR"] = str(blocker / "state")
    assert g.decide(READS["nav_other"], env, bad).allow


# ---- clipboard / receipts ---------------------------------------------------------------------------
PASTE_KEYS = ["cmd+v", "ctrl+v", "shift+insert", "cmd+shift+v", "ctrl+shift+v", "super+v", "Meta+V"]


def paste(keys="cmd+v", session="s1"):
    return payload("computer_use", {"action": "key", "keys": keys, "app": "Google Chrome for Testing"}, session)


def receipts(env):
    p = Path(env["MEDIUM_GUARD_STATE_DIR"]) / "receipts.jsonl"
    return [json.loads(x)["rec"] for x in p.read_text().splitlines()] if p.exists() else []


@pytest.mark.parametrize("keys", PASTE_KEYS)
def test_paste_variants_check_clipboard(keys, env):
    assert g.decide(paste(keys), env, ok, good_clip).allow
    assert not g.decide(paste(keys), env, ok, lambda e: ("something else entirely, not the article at all!!", None, "")).allow


def test_paste_key_in_browser_and_browse_cli_is_checked(env):
    wrong = lambda e: ("totally different clipboard content that is long enough to matter", None, "")  # noqa: E731
    g.decide(payload("browser_navigate", {"url": "https://medium.com/me/stats"}), env, ok)
    assert not g.decide(payload("browser_press", {"key": "Meta+v"}), env, ok, wrong).allow
    assert g.decide(payload("browser_press", {"key": "Meta+v"}), env, ok, good_clip).allow
    assert not g.decide(payload("terminal", {"command": "$B goto https://medium.com/new-story && $B paste"}), env, ok, wrong).allow


def test_clipboard_full_paste_is_exact_bytes_no_rstrip(env):
    assert g.decide(paste(), env, ok, lambda e: (BODY.encode(), None, "")).allow  # bytes, as pbpaste returns
    for variant in (BODY.rstrip(), BODY + "\n", BODY.rstrip() + "\n\n\n", BODY.replace("long", "LONG"),
                    BODY.replace("\n", "\r\n")):
        assert not g.decide(paste(session="fresh" + g._sha(variant)[:6]), env, ok,
                            lambda e, v=variant: (v, None, "")).allow, repr(variant[-6:])


def test_clipboard_fragment_rules(env):
    frag = "A long released paragraph that is definitely longer than forty characters in total."
    assert g.decide(paste(), env, ok, good_clip).allow  # full paste first: fragments are only legal afterwards
    assert g.decide(paste(), env, ok, lambda e: (frag, None, "")).allow
    assert not g.decide(paste(), env, ok, lambda e: ("A long released", None, "")).allow  # < 40 chars
    assert not g.decide(paste(), env, ok, lambda e: ("", None, "")).allow
    assert not g.decide(paste(), env, ok, lambda e: (None, None, "pbpaste failed")).allow


def test_rich_flavor_mismatch_blocks(env):
    assert not g.decide(paste(), env, ok, lambda e: (BODY, " injected unrelated rich content ", "")).allow
    assert g.decide(paste(), env, ok, lambda e: (BODY, " Title  A long released paragraph that is definitely"
                                                   " longer than forty characters in total. ", "")).allow


def test_receipt_written_and_scoped_to_session(env):
    assert g.decide(paste(session="sA"), env, ok, good_clip).allow
    r = receipts(env)
    assert len(r) == 1 and r[0]["session_id"] == "sA" and r[0]["kind"] == "full"
    assert r[0]["release_sha256"] == g._sha(BODY) and r[0]["clipboard_sha256"] == g._sha(BODY) and r[0]["ts"].endswith("Z")
    click = lambda s: payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"}, s)  # noqa: E731
    assert g.decide(click("sA"), env, ok, good_clip).allow
    assert not g.decide(click("sB"), env, ok, good_clip).allow  # other session never pasted


def test_fragment_paste_before_full_paste_is_blocked_and_unlocks_nothing(env):
    frag = "A long released paragraph that is definitely longer than forty characters in total."
    d = g.decide(paste(), env, ok, lambda e: (frag, None, ""))
    assert not d.allow and "fragment" in d.reason
    assert receipts(env) == []
    assert not g.decide(MUTATIONS["cu_click"], env, ok, good_clip).allow


def test_receipt_for_old_release_hash_does_not_count(env):
    assert g.decide(paste(), env, ok, good_clip).allow
    rel = Path(env["MEDIUM_GUARD_WORKSPACE"]) / "articles" / "pkg1" / "release" / "medium-final.md"
    rel.write_text(BODY + "Extra released sentence.\n")
    assert not g.decide(MUTATIONS["cu_click"], env, ok, good_clip).allow


def test_failed_paste_writes_no_receipt(env):
    g.decide(paste(), env, ok, lambda e: ("nope nope nope nope nope nope nope nope nope nope", None, ""))
    assert receipts(env) == []


def test_right_click_always_blocked_and_enter_rules(env):
    rc = payload("computer_use", {"action": "right_click", "element": 1, "app": "GStack Browser"})
    typ = lambda t: payload("computer_use", {"action": "type", "text": t, "app": "GStack Browser"})  # noqa: E731
    ret = payload("computer_use", {"action": "key", "keys": "return", "app": "GStack Browser"})
    tab = payload("computer_use", {"action": "key", "keys": "tab", "app": "GStack Browser"})
    assert not g.decide(rc, env, ok, good_clip).allow
    assert not g.decide(ret, env, ok, good_clip).allow
    assert not g.decide(tab, env, ok, good_clip).allow  # other keys: blocked before the receipt
    assert not g.decide(typ("https://medium.com/p/abc/edit"), env, ok, good_clip).allow  # not an exact editor URL
    assert not g.decide(ret, env, ok, good_clip).allow
    assert g.decide(typ(EDIT_URL), env, ok, good_clip).allow  # exact editor URL from workflow.json
    assert g.decide(ret, env, ok, good_clip).allow  # submits the typed URL
    assert not g.decide(ret, env, ok, good_clip).allow  # one Enter per typed URL
    assert g.decide(typ("https://medium.com/new-story"), env, ok, good_clip).allow
    assert g.decide(ret, env, ok, good_clip).allow
    assert g.decide(paste(), env, ok, good_clip).allow
    assert g.decide(tab, env, ok, good_clip).allow  # after the full paste
    assert not g.decide(rc, env, ok, good_clip).allow  # right-click is never allowed
    g.decide(typ("Title"), env, ok, good_clip)
    assert g.decide(ret, env, ok, good_clip).allow  # post-receipt Enter is allowed again


def test_read_actions_still_allowed_before_receipt(env):
    for a in ({"action": "capture"}, {"action": "scroll", "direction": "down"}, {"action": "list_windows"}):
        assert g.decide(payload("computer_use", a), env, bad, good_clip).allow


def test_decision_log_written_when_configured(env, tmp_path):
    env["MEDIUM_GUARD_LOG"] = str(tmp_path / "d.jsonl")
    run_main(MUTATIONS["nav_edit"], env, bad)
    run_main(READS["snapshot"], env, bad)
    rows = [json.loads(x) for x in (tmp_path / "d.jsonl").read_text().splitlines()]
    assert len(rows) == 1 and rows[0]["allow"] is False and rows[0]["tool"] == "browser_navigate"
