"""Authorization refusal paths: every one must stop before anything would be pasted or clicked."""
from __future__ import annotations

import dataclasses
import hashlib
import json
import os
from unittest import mock

import pytest

from scripts.fingerprint_eval import authz
from scripts.publish_broker import keys
from scripts.publish_broker.schema import MAX_REQUEST_BYTES

from .conftest import UID, make_package


def code(resp):
    assert resp["ok"] is False, resp
    return resp["error"]["code"]


# ---- happy path (so the refusals below are meaningful) --------------------------------------------------------------
def test_authorize_then_publish_dry_run_reports_exact_paste_and_click(world):
    a = world.authorize()
    final = (world.cfg.store_dir / "snapshots").glob("*/ws/articles/alpha/release/medium-final.md")
    final_bytes = next(iter(final)).read_bytes()
    r = world.publish(a["auth_id"], "draft")
    assert r["ok"], r
    res = r["result"]
    assert res["dry_run"] is True and res["compare_wired"] is False
    paste = next(s for s in res["would"] if s["step"] == "paste")
    assert paste["sha256"] == hashlib.sha256(final_bytes).hexdigest() == a["content_sha256"] and paste["bytes"] == len(final_bytes)
    assert [s["step"] for s in res["would"]] == ["paste", "read_back", "compare", "click"]
    assert res["would"][-1] == {"step": "click", "action": "draft"}


def test_authorize_runs_the_canonical_evaluator_on_a_snapshot_not_the_agent_tree(world):
    a = world.authorize()
    assert world.runner.authorize_calls == 1
    # the agent's own tree got no release files: all gate output lives in the broker store
    assert not (world.workspace / "articles" / "alpha" / "release").exists()
    # tampering with the workspace after authorize cannot change what would be pasted
    (world.workspace / "articles" / "alpha" / "article-medium.md").write_text("EVIL replacement\n")
    r = world.publish(a["auth_id"])
    assert r["ok"] and r["result"]["content_sha256"] == a["content_sha256"]


def test_agent_forged_release_dir_is_not_imported_into_the_snapshot(world):
    pkg = world.workspace / "articles" / "alpha"
    (pkg / "release").mkdir()
    (pkg / "release" / "medium-final.md").write_text("FORGED\n")
    (pkg / "release" / "authorization.json").write_text(json.dumps({"binding": {"content_sha256": "0" * 64}, "hmac_sha256": "x"}))
    (pkg / "QUARANTINE.json").write_text("{}")
    a = world.authorize()
    forged = hashlib.sha256(b"FORGED\n").hexdigest()
    assert a["content_sha256"] != forged
    assert world.publish(a["auth_id"])["ok"]


# ---- request schema: bytes, paths and inline documents are never accepted --------------------------------------------
@pytest.mark.parametrize("field", ["content", "markdown", "release_md", "html", "bytes", "body", "path", "authorization", "auth"])
def test_client_sending_content_instead_of_a_package_ref_is_rejected(world, field):
    assert code(world.req(op="authorize", package="alpha", **{field: "# my own article bytes"})) == "content_not_accepted"
    assert code(world.req(op="publish", auth_id="0" * 32, action="draft", **{field: "x"})) == "content_not_accepted"
    assert world.runner.authorize_calls == 0


def test_oversized_request_is_rejected_without_parsing(world):
    raw = json.dumps({"v": 1, "op": "authorize", "package": "alpha", "pad": "x" * MAX_REQUEST_BYTES}).encode()
    assert code(world.broker.handle_raw(raw, UID)) == "request_too_large"


@pytest.mark.parametrize("pkg", ["../alpha", "/etc/passwd", "a/b", "..", "Alpha", "", "a" * 200, "alpha\n", None, 7])
def test_package_must_be_a_slug_not_a_path(world, pkg):
    assert code(world.req(op="authorize", package=pkg)) == "bad_package_ref"


@pytest.mark.parametrize("raw,expected", [(b"not json", "bad_json"), (b"[]", "bad_request"), (b'{"v":2,"op":"status"}', "bad_version"),
                                          (b'{"v":1,"op":"rm"}', "unknown_op"), (b'{"v":1,"op":"status","x":1}', "unknown_field")])
def test_malformed_requests(world, raw, expected):
    assert code(world.broker.handle_raw(raw, UID)) == expected


def test_peer_not_allowed(world):
    for uid in (UID + 1, None):
        assert code(world.broker.handle_raw(b'{"v":1,"op":"status"}', uid)) == "peer_not_allowed"


# ---- authorization document: unsigned, wrong key, hash mismatch, expiry -----------------------------------------------
def test_unsigned_authorization_refused(world):
    a = world.authorize()
    p = world.auth_path(a["auth_id"])
    doc = json.loads(p.read_text())
    doc.pop(keys.SIG_FIELD)
    p.write_text(json.dumps(doc))
    assert code(world.publish(a["auth_id"])) == "auth_signature_invalid"


def test_authorization_signed_with_a_different_key_refused(world, tmp_path):
    a = world.authorize()
    p = world.auth_path(a["auth_id"])
    other = tmp_path / "other.key"
    other.write_bytes(b"f" * 64)
    other.chmod(0o600)
    p.write_text(json.dumps(keys.sign(keys.load_key(other), json.loads(p.read_text()))))
    assert code(world.publish(a["auth_id"])) == "auth_signature_invalid"


def test_editing_a_signed_field_invalidates_the_signature(world):
    a = world.authorize()
    p = world.auth_path(a["auth_id"])
    doc = json.loads(p.read_text())
    doc["content_sha256"] = hashlib.sha256(b"other").hexdigest()
    p.write_text(json.dumps(doc))
    assert code(world.publish(a["auth_id"])) == "auth_signature_invalid"


def test_forged_auth_made_by_the_agent_with_the_evaluator_record_key_refused(world):
    """Even holding the broker's EVAL key (not the broker key) does not let anyone mint a broker authorization."""
    a = world.authorize()
    p = world.auth_path(a["auth_id"])
    eval_key = keys.load_key(world.cfg.store_dir / "keys" / "eval.key")
    p.write_text(json.dumps(keys.sign(eval_key, json.loads(p.read_text()))))
    assert code(world.publish(a["auth_id"])) == "auth_signature_invalid"


def test_snapshot_bytes_changed_after_authorize_refused_by_hash(world):
    a = world.authorize()
    final = next((world.cfg.store_dir / "snapshots").glob("*/ws/articles/alpha/release/medium-final.md"))
    final.write_bytes(final.read_bytes() + b"one extra line\n")
    assert code(world.publish(a["auth_id"])) == "content_hash_mismatch"


def test_unknown_and_bad_auth_ids(world):
    assert code(world.publish("0" * 32)) == "auth_not_found"
    assert code(world.req(op="publish", auth_id="../../keys/broker.key", action="draft")) == "bad_auth_id"


def test_expired_authorization_refused(world):
    a = world.authorize()
    world.clock[0] += world.cfg.auth_ttl_seconds + 1
    assert code(world.publish(a["auth_id"])) == "auth_expired"


# ---- stale evaluator ---------------------------------------------------------------------------------------------------
def test_pinned_checkout_moved_after_authorize_is_stale(world):
    a = world.authorize()
    world.runner.sha = "b" * 40
    assert code(world.publish(a["auth_id"])) == "stale_evaluator"


def test_evaluator_changed_after_authorize_fails_fresh_verify_as_stale(world):
    """The real verifier recomputes the binding from the evaluator as it is now; a different evaluator id is stale."""
    a = world.authorize()
    cur = authz.evaluator_version()
    with mock.patch.object(authz, "evaluator_version", return_value=dataclasses.replace(cur, git_sha="c" * 40)):
        assert code(world.publish(a["auth_id"])) == "stale_evaluator"


def test_dirty_or_unpinned_checkout_blocks_authorize(world):
    world.runner.clean = False
    assert code(world.req(op="authorize", package="alpha")) == "evaluator_dirty"
    world.runner.clean, world.runner.sha = True, "d" * 40
    assert code(world.req(op="authorize", package="alpha")) == "stale_evaluator"
    assert world.runner.authorize_calls == 0


# ---- policy and prototype limits -----------------------------------------------------------------------------------------
def test_policy_ceiling_and_no_real_publish(world):
    a = world.authorize()
    assert code(world.publish(a["auth_id"], "publish")) == "action_not_permitted"  # ceiling is "schedule"
    assert world.publish(a["auth_id"], "schedule", schedule_at="2030-01-01T09:00:00+00:00")["ok"]
    assert code(world.publish(a["auth_id"], "draft", dry_run=False)) == "executor_not_implemented"


def test_schedule_requires_timezone_aware_time(world):
    a = world.authorize()
    assert code(world.publish(a["auth_id"], "schedule")) == "bad_schedule"
    assert code(world.publish(a["auth_id"], "schedule", schedule_at="2030-01-01T09:00:00")) == "bad_schedule"
    assert code(world.publish(a["auth_id"], "draft", schedule_at="2030-01-01T09:00:00+00:00")) == "bad_schedule"


# ---- authorize refusals ---------------------------------------------------------------------------------------------------
def test_failed_gate_is_not_authorized_and_leaves_no_snapshot(world):
    (world.workspace / "articles" / "empty").mkdir()
    assert code(world.req(op="authorize", package="empty")) == "not_authorized"
    assert list((world.cfg.store_dir / "snapshots").iterdir()) == []
    assert list((world.cfg.store_dir / "auth").iterdir()) == []


def test_missing_symlinked_and_symlink_containing_packages(world, tmp_path):
    assert code(world.req(op="authorize", package="nope")) == "package_not_found"
    os.symlink(world.workspace / "articles" / "alpha", world.workspace / "articles" / "linked")
    assert code(world.req(op="authorize", package="linked")) == "bad_package_ref"
    pkg = make_package(world.workspace, "beta")
    os.symlink("/etc/hosts", pkg / "leak.md")
    assert code(world.req(op="authorize", package="beta")) == "package_has_symlink"
    assert world.runner.authorize_calls == 0


# ---- keys ----------------------------------------------------------------------------------------------------------------
def test_key_files_must_be_private_regular_and_owned(tmp_path):
    k = tmp_path / "k"
    k.write_bytes(b"a" * 64)
    k.chmod(0o640)
    with pytest.raises(keys.KeyProblem, match="0600"):
        keys.load_key(k)
    k.chmod(0o600)
    assert keys.load_key(k) == b"a" * 64
    link = tmp_path / "link"
    os.symlink(k, link)
    with pytest.raises(keys.KeyProblem):
        keys.load_key(link)
    short = tmp_path / "short"
    short.write_bytes(b"abc")
    short.chmod(0o600)
    with pytest.raises(keys.KeyProblem, match="short"):
        keys.load_key(short)


def test_audit_log_records_every_request_with_peer_uid_and_no_content(world):
    world.req(op="status")
    world.req(op="authorize", package="alpha", content="SECRET-BYTES")
    lines = [json.loads(line) for line in (world.cfg.store_dir / "audit.jsonl").read_text().splitlines()]
    assert [r["op"] for r in lines] == ["status", "authorize"] and all(r["peer_uid"] == UID for r in lines)
    assert "SECRET-BYTES" not in (world.cfg.store_dir / "audit.jsonl").read_text()
