"""Fail-closed handlers, tamper resistance (HMAC receipts/state, pinned copy + manifest), delegation rule,
installer and operator selftest. Honest scope: these defeat file-edit tampering through normal agent file
tools, not a determined same-user process (which can read the key)."""
from __future__ import annotations

import io
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import medium_publish_guard as g  # noqa: E402
from guard_testutil import install_fake_guard  # noqa: E402
from test_medium_publish_guard import (BODY, MUTATIONS, READS, bad, env, good_clip, ok, paste, payload,  # noqa: E402,F401
                                       receipts, run_main)

CLICK = payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"})
MED_NAV = payload("browser_navigate", {"url": "https://medium.com/new-story"})


def boom(*a, **k):
    raise RuntimeError("kaput")


# ---- could_mutate: the only thing allowed to say "pass" on an error --------------------------------
@pytest.mark.parametrize("p", [
    payload("computer_use", {"action": "click", "element": 1}),
    payload("computer_use", {"action": "type", "text": "x", "app": "Finder"}),
    payload("computer_use", {"action": "zzz-unknown"}),
    payload("computer_use", {}),
    {"tool_name": "computer_use", "tool_input": "oops"},
    payload("browser_click", {"ref": "@e1"}),
    payload("browser_type", {"ref": "@e1", "text": "x"}),
    payload("browser_totally_new_tool", {}),
    payload("browser_navigate", {"url": "https://medium.com/me/stats"}),
    payload("browser_navigate", {"url": ""}),
    payload("terminal", {"command": "curl https://medium.com/new-story"}),
    payload("terminal", {"command": "$B click @e1"}),
    payload("terminal", {"command": "osascript -e 'x'"}),
    payload("execute_code", {"code": "import playwright"}),
    payload("terminal", "not-a-dict"),
    payload("some_other_tool", {"u": "https://medium.com/p/x/edit"}),
    {"tool_name": "", "tool_input": {}},
    {"tool_input": {}},
    {"tool_name": 7},
    ["not", "a", "dict"],
])
def test_could_mutate_true(p):
    assert g.could_mutate(p)


@pytest.mark.parametrize("p", [
    payload("computer_use", {"action": "capture"}),
    payload("computer_use", {"action": "list_apps"}),
    payload("browser_snapshot", {}),
    payload("browser_navigate", {"url": "https://example.com"}),
    payload("terminal", {"command": "ls data"}),
    payload("read_file", {"path": "/tmp/x"}),
])
def test_could_mutate_false(p):
    assert not g.could_mutate(p)


# ---- every handler fails closed -----------------------------------------------------------------
def test_main_unparseable_and_unknown_payloads_block(env):
    for raw in ("not json", "[1]", "null", "{}", '{"tool_name": ""}', '{"tool_name": 3}', '{"tool_input": {}}'):
        assert run_main(raw, env, ok) == 2, raw


def test_main_stdin_read_error_blocks(env):
    class Bad:
        def read(self):
            raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "bad")
    assert g.main(Bad(), env, ok) == 2


def test_main_decide_exception_blocks_mutation_like_only(env, monkeypatch):
    monkeypatch.setattr(g, "decide", boom)
    assert run_main(MUTATIONS["cu_click"], env, ok) == 2
    assert run_main(MUTATIONS["nav_edit"], env, ok) == 2
    assert run_main(MUTATIONS["term_curl_post"], env, ok) == 2
    assert run_main(payload("browser_click", {"ref": "@e1"}), env, ok) == 2
    assert run_main(READS["cu_capture"], env, ok) == 0
    assert run_main(READS["term_ls"], env, ok) == 0


def test_decide_classify_exception_blocks_mutation_allows_read(env, monkeypatch):
    monkeypatch.setattr(g, "classify", boom)
    assert not g.decide(MUTATIONS["cu_click"], env, ok).allow
    assert not g.decide(MUTATIONS["term_osascript"], env, ok).allow
    assert g.decide(READS["cu_capture"], env, ok).allow
    assert g.decide(READS["snapshot"], env, ok).allow


def test_corrupt_state_blocks_browser_input_on_any_page(env):
    g.decide(payload("browser_navigate", {"url": "https://medium.com/me/stats"}), env, bad)
    Path(env["MEDIUM_GUARD_STATE_DIR"], "url-memory.json").write_text("{garbage")
    assert run_main(payload("browser_click", {"ref": "@e1"}), env, ok) == 2
    assert run_main(payload("terminal", {"command": "$B click @e3"}), env, ok) == 2


def test_state_tamper_edit_detected(env):
    g.decide(payload("browser_navigate", {"url": "https://example.com"}), env, ok)
    sp = Path(env["MEDIUM_GUARD_STATE_DIR"], "url-memory.json")
    doc = json.loads(sp.read_text())
    doc["data"]["s1"] = "https://medium.com/me/stats"  # edit without re-signing
    sp.write_text(json.dumps(doc))
    assert run_main(payload("browser_click", {"ref": "@e1"}), env, ok) == 2
    sp.write_text(json.dumps(doc["data"]))  # unsigned, bare data
    assert run_main(payload("browser_click", {"ref": "@e1"}), env, ok) == 2


def test_state_write_failure_blocks_medium_navigation(env, tmp_path):
    blocker = tmp_path / "afile"
    blocker.write_text("x")
    env["MEDIUM_GUARD_STATE_DIR"] = str(blocker / "state")
    for name in ("nav_new_story", "nav_edit", "nav_submission"):
        assert run_main(MUTATIONS[name], env, ok) == 2, name
    assert run_main(READS["nav_stats"], env, bad) == 2  # Medium url, memory unwritable
    assert run_main(payload("terminal", {"command": "$B goto https://medium.com/me/stats"}), env, ok) == 2
    assert run_main(READS["nav_other"], env, ok) == 0   # clearly non-Medium
    assert run_main(READS["cu_capture"], env, ok) == 0


def test_typed_memory_write_failure_blocks_type(env, tmp_path, monkeypatch):
    monkeypatch.setattr(g, "_remember_typed", boom)
    t = payload("computer_use", {"action": "type", "text": "Title", "app": "GStack Browser"})
    assert not g.decide(t, env, ok, good_clip).allow


def test_receipt_write_failure_blocks_paste(env, monkeypatch):
    monkeypatch.setattr(g, "write_receipt", boom)
    d = g.decide(paste(), env, ok, good_clip)
    assert not d.allow and "failing closed" in d.reason


def test_receipt_store_unreadable_blocks_click(env):
    assert g.decide(paste(), env, ok, good_clip).allow
    rp = Path(env["MEDIUM_GUARD_STATE_DIR"], "receipts.jsonl")
    rp.unlink()
    rp.mkdir()  # reading a directory raises OSError
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_verifier_exception_blocks(env):
    d = g.decide(CLICK, env, boom, good_clip)
    assert not d.allow and "authorization error" in d.reason


def test_clipboard_exception_blocks_paste(env):
    assert not g.decide(paste(), env, ok, boom).allow


def test_active_package_exception_blocks(env, monkeypatch):
    monkeypatch.setattr(g, "active_package", boom)
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_content_policy_unexpected_exception_blocks(env, monkeypatch):
    monkeypatch.setattr(g, "kind_of", boom)
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_run_verify_failures_are_nonzero(env, monkeypatch, tmp_path):
    def raise_os(*a, **k):
        raise OSError("no exec")
    monkeypatch.setattr(g.subprocess, "run", raise_os)
    rc, _ = g.run_verify(tmp_path, env)
    assert rc != 0
    assert not g.decide(CLICK, env, None, good_clip).allow


def test_log_decision_failure_never_changes_decision(env, tmp_path):
    env["MEDIUM_GUARD_LOG"] = str(tmp_path / "afile" / "nope" / "log.jsonl")
    (tmp_path / "afile").write_text("x")
    assert run_main(MUTATIONS["nav_edit"], env, bad) == 2
    assert run_main(MUTATIONS["nav_edit"], env, ok) == 0


def test_block_output_failure_still_exits_2(env, monkeypatch):
    class Broken(io.StringIO):
        def write(self, s):
            raise OSError("closed")
    monkeypatch.setattr(sys, "stdout", Broken())
    monkeypatch.setattr(sys, "stderr", Broken())
    assert run_main(MUTATIONS["cu_click"], env, bad) == 2


def test_script_entry_never_falls_through_to_allow(env):
    """Run the real file as Hermes would, with a PYTHONPATH-poisoned environment and a broken HOME."""
    p = subprocess.run([sys.executable, str(HERE / "medium_publish_guard.py")], input=json.dumps(MUTATIONS["cu_click"]),
                       text=True, capture_output=True, env={**os.environ, **env, "MEDIUM_GUARD_DIR": "/nonexistent"})
    assert p.returncode == 2
    p = subprocess.run([sys.executable, str(HERE / "medium_publish_guard.py")], input="\xff garbage",
                       text=True, capture_output=True)
    assert p.returncode == 2


# ---- tamper resistance --------------------------------------------------------------------------
def test_unsigned_receipt_does_not_unlock_clicks(env):
    assert g.decide(paste(), env, ok, good_clip).allow
    rp = Path(env["MEDIUM_GUARD_STATE_DIR"], "receipts.jsonl")
    rec = json.loads(rp.read_text().splitlines()[0])["rec"]
    rp.write_text(json.dumps(rec) + "\n" + json.dumps({"rec": rec}) + "\n" + json.dumps({"rec": rec, "sig": "00" * 32}) + "\n")
    d = g.decide(CLICK, env, ok, good_clip)
    assert not d.allow and "paste receipt" in d.reason


def test_edited_receipt_rejected(env):
    assert g.decide(paste(session="sA"), env, ok, good_clip).allow
    rp = Path(env["MEDIUM_GUARD_STATE_DIR"], "receipts.jsonl")
    rp.write_text(rp.read_text().replace('"sA"', '"sB"'))
    click_b = payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"}, "sB")
    assert not g.decide(click_b, env, ok, good_clip).allow
    assert not g.decide(payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"}, "sA"),
                        env, ok, good_clip).allow


def test_hand_forged_receipt_without_key_rejected(env):
    pkg = Path(env["MEDIUM_GUARD_WORKSPACE"]) / "articles" / "pkg1"
    rec = {"ts": "2026-10-04T00:00:00Z", "session_id": "s1", "package": str(pkg.resolve()),
           "clipboard_sha256": g._sha(BODY), "release_sha256": g._sha(BODY), "kind": "full"}
    rp = Path(env["MEDIUM_GUARD_STATE_DIR"], "receipts.jsonl")
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps({"rec": rec, "sig": g.hmac.new(b"guess", g._canon(rec), "sha256").hexdigest()}) + "\n")
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_receipt_in_old_package_location_is_ignored(env):
    pkg = Path(env["MEDIUM_GUARD_WORKSPACE"]) / "articles" / "pkg1"
    legacy = pkg / "release" / "paste-receipts.jsonl"
    legacy.write_text(json.dumps({"session_id": "s1", "release_sha256": g._sha(BODY), "kind": "full"}) + "\n")
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_receipt_for_other_package_rejected(env):
    assert g.decide(paste(), env, ok, good_clip).allow
    ws = Path(env["MEDIUM_GUARD_WORKSPACE"])
    pkg2 = ws / "articles" / "pkg2"
    (pkg2 / "release").mkdir(parents=True)
    (pkg2 / "release" / "medium-final.md").write_text(BODY)  # same bytes, different package
    (ws / "release" / "ACTIVE.json").write_text(json.dumps({"package": "pkg2"}))
    assert not g.decide(CLICK, env, ok, good_clip).allow


def test_receipts_live_outside_repo_and_package(env):
    assert g.decide(paste(), env, ok, good_clip).allow
    assert Path(env["MEDIUM_GUARD_STATE_DIR"], "receipts.jsonl").exists()
    pkg = Path(env["MEDIUM_GUARD_WORKSPACE"]) / "articles" / "pkg1"
    assert not list(pkg.rglob("*receipt*"))


def test_guard_hash_mismatch_blocks_mutations_not_reads(env):
    man = Path(env["MEDIUM_GUARD_DIR"], "manifest.sha256")
    man.write_text("0" * 64 + "  medium_publish_guard.py\n")
    d = g.decide(CLICK, env, ok, good_clip)
    assert not d.allow and "integrity" in d.reason
    assert run_main(MUTATIONS["nav_edit"], env, ok) == 2
    assert run_main(READS["cu_capture"], env, ok) == 0


@pytest.mark.parametrize("breakage", ["no_manifest", "no_entry", "no_key", "short_key", "key_world_readable",
                                      "config_not_in_manifest", "config_edited"])
def test_integrity_breakage_blocks_mutation(env, breakage):
    gd = Path(env["MEDIUM_GUARD_DIR"])
    if breakage == "no_manifest":
        (gd / "manifest.sha256").unlink()
    elif breakage == "no_entry":
        (gd / "manifest.sha256").write_text("")
    elif breakage == "no_key":
        (gd / "key").chmod(0o600)
        (gd / "key").unlink()
    elif breakage == "short_key":
        (gd / "key").chmod(0o600)
        (gd / "key").write_text("abc")
        (gd / "key").chmod(0o400)
    elif breakage == "key_world_readable":
        (gd / "key").chmod(0o644)
    elif breakage == "config_not_in_manifest":
        (gd / "config.json").write_text("{}")
    elif breakage == "config_edited":
        (gd / "config.json").write_text("{}")
        man = (gd / "manifest.sha256").read_text()
        (gd / "manifest.sha256").write_text(man + f"{g._sha('other')}  config.json\n")
    assert not g.decide(CLICK, env, ok, good_clip).allow
    assert run_main(READS["cu_capture"], env, ok) == 0


def test_modified_guard_file_blocks_when_run_for_real(tmp_path):
    """A patched copy of the guard, manifest pinned to the ORIGINAL bytes, must block mutations."""
    e = install_fake_guard(tmp_path)  # manifest = hash of the repo guard
    patched = tmp_path / "medium_publish_guard.py"
    patched.write_text((HERE / "medium_publish_guard.py").read_text() + "\n# agent edit\n")
    base = {**os.environ, **e, "MEDIUM_GUARD_WORKSPACE": str(tmp_path)}
    run = lambda pl, script: subprocess.run([sys.executable, str(script)], input=json.dumps(pl), text=True,  # noqa: E731
                                            capture_output=True, env=base).returncode
    assert run(MUTATIONS["nav_edit"], HERE / "medium_publish_guard.py") == 2  # blocked, no ACTIVE
    p = subprocess.run([sys.executable, str(patched)], input=json.dumps(MUTATIONS["nav_edit"]), text=True,
                       capture_output=True, env=base)
    assert p.returncode == 2 and "integrity" in p.stdout
    assert run(READS["cu_capture"], patched) == 0


# ---- no delegation ------------------------------------------------------------------------------
def test_delegated_child_session_needs_its_own_verified_paste(env):
    parent_click = payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"}, "parent-1")
    child_click = payload("computer_use", {"action": "click", "element": 2, "app": "GStack Browser"}, "parent-1_child7")
    assert g.decide(paste(session="parent-1"), env, ok, good_clip).allow
    assert g.decide(parent_click, env, ok, good_clip).allow
    d = g.decide(child_click, env, ok, good_clip)
    assert not d.allow and "paste receipt" in d.reason
    assert g.decide(paste(session="parent-1_child7"), env, ok, good_clip).allow  # its own paste unlocks it
    assert g.decide(child_click, env, ok, good_clip).allow


# ---- installer + operator selftest --------------------------------------------------------------
@pytest.fixture()
def installed(tmp_path):
    dest = tmp_path / "home" / ".hermes" / "guards"
    e = {**os.environ, "HERMES_GUARD_DIR": str(dest), "HOME": str(tmp_path / "home"),
         "HERMES_GUARD_UV": g.find_uv_for_tests()}
    (tmp_path / "home").mkdir()
    p = subprocess.run(["bash", str(HERE / "install_guard.sh")], capture_output=True, text=True, env=e)
    yield dest, e, p
    if dest.exists():
        dest.chmod(0o700)


def mode(p: Path) -> int:
    return stat.S_IMODE(p.stat().st_mode)


def test_installer_modes_manifest_and_hash(installed):
    dest, e, p = installed
    assert p.returncode == 0, p.stderr
    assert mode(dest) == 0o555
    assert mode(dest / "medium_publish_guard.py") == 0o444 and mode(dest / "manifest.sha256") == 0o444
    assert mode(dest / "key") == 0o400 and mode(dest / "state") == 0o700
    sha = g._sha((HERE / "medium_publish_guard.py").read_bytes())
    assert (dest / "medium_publish_guard.py").read_bytes() == (HERE / "medium_publish_guard.py").read_bytes()
    assert f"{sha}  medium_publish_guard.py" in (dest / "manifest.sha256").read_text()
    assert sha in p.stdout
    assert len((dest / "key").read_text()) == 64
    cfg = json.loads((dest / "config.json").read_text())
    assert Path(cfg["repo"]).samefile(HERE.parents[1])


def test_installer_reinstall_keeps_key_and_rotate_replaces_it(installed):
    dest, e, _ = installed
    k1 = (dest / "key").read_text()
    assert subprocess.run(["bash", str(HERE / "install_guard.sh")], env=e, capture_output=True).returncode == 0
    assert (dest / "key").read_text() == k1
    assert subprocess.run(["bash", str(HERE / "install_guard.sh"), "--rotate-key"], env=e, capture_output=True).returncode == 0
    assert (dest / "key").read_text() != k1


def test_selftest_passes_on_clean_install(installed):
    dest, e, p = installed
    assert p.returncode == 0
    r = subprocess.run(["bash", str(HERE / "guard_selftest.sh")], env=e, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "FAIL" not in r.stdout and "17/17" in r.stdout


def test_selftest_exits_nonzero_when_install_is_tampered(installed):
    dest, e, _ = installed
    dest.chmod(0o700)
    (dest / "manifest.sha256").chmod(0o600)
    (dest / "manifest.sha256").write_text("0" * 64 + "  medium_publish_guard.py\n")  # guard now blocks everything
    r = subprocess.run(["bash", str(HERE / "guard_selftest.sh")], env=e, capture_output=True, text=True)
    assert r.returncode != 0 and "FAIL" in r.stdout  # the ACTIVE + verified paste -> allow case is now wrong


def test_selftest_exits_nonzero_when_guard_allows_everything(installed):
    dest, e, _ = installed
    dest.chmod(0o700)
    guard = dest / "medium_publish_guard.py"
    guard.chmod(0o600)
    guard.write_text("import sys\nsys.exit(0)\n")  # a guard that fails open
    r = subprocess.run(["bash", str(HERE / "guard_selftest.sh")], env=e, capture_output=True, text=True)
    assert r.returncode != 0 and "FAIL" in r.stdout


def test_selftest_without_install_fails(tmp_path):
    e = {**os.environ, "HERMES_GUARD_DIR": str(tmp_path / "missing")}
    assert subprocess.run(["bash", str(HERE / "guard_selftest.sh")], env=e, capture_output=True).returncode != 0
