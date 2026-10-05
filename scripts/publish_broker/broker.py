"""Broker core: authorize and publish, with every check done against broker-owned state.

authorize(package slug): snapshot the package into the store, run the canonical evaluator on the snapshot from the
pinned checkout (record key = the broker's), re-verify, then sign a broker authorization with the broker key.
publish(auth_id): re-check signature, expiry, policy ceiling, pinned evaluator, snapshot bytes and a fresh
`release verify`, then hand the exact snapshot bytes to the executor (dry-run only in this prototype).

The publishing agent supplies a slug or an auth_id and nothing else. It cannot name bytes, paths or evaluators."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
import uuid
from pathlib import Path

from . import keys, packages
from .config import BrokerConfig
from .executor import Comparator, DryRunEditor, compare_stub, execute
from .runner import ReleaseRunner
from .schema import ACTIONS, AUTH_ID_RE, BrokerError, err, ok, parse_request

AUTH_VERSION = 1


class Broker:
    def __init__(self, cfg: BrokerConfig, runner: ReleaseRunner, *, comparator: Comparator = compare_stub, clock=time.time) -> None:
        self.cfg, self.runner, self.comparator, self.clock = cfg, runner, comparator, clock
        self.store = Path(cfg.store_dir)
        for sub in ("keys", "snapshots", "auth"):
            (self.store / sub).mkdir(parents=True, exist_ok=True, mode=0o700)
        self.broker_key = keys.load_key(self.store / "keys" / "broker.key", create=True)
        self.eval_key_file = self.store / "keys" / "eval.key"
        keys.load_key(self.eval_key_file, create=True)  # fails fast on a mis-provisioned key

    # ---- entry point -------------------------------------------------------------------------------------
    def handle_raw(self, raw: bytes, peer_uid: int | None) -> dict:
        try:
            if peer_uid is None or peer_uid not in self.cfg.allowed_uids:
                raise BrokerError("peer_not_allowed", "connecting uid is not allowed")
            req = parse_request(raw)
            result = getattr(self, "op_" + req["op"])(req)
            resp = ok(result)
        except BrokerError as e:
            resp = err(e.code, e.message)
        except Exception as e:  # noqa: BLE001  fail closed with a generic code; detail goes to the audit log only
            self._audit({"event": "internal_error", "peer_uid": peer_uid, "error": f"{type(e).__name__}: {e}"[:300]})
            return err("internal_error", "broker failed closed; see the broker audit log")
        self._audit({"event": "request", "peer_uid": peer_uid, "ok": resp["ok"], "code": resp.get("error", {}).get("code"),
                     "op": _safe_op(raw)})
        return resp

    # ---- ops ----------------------------------------------------------------------------------------------
    def op_status(self, req: dict) -> dict:
        sha, clean = self.runner.head()
        return {"protocol": 1, "pinned_sha": self.cfg.pinned_sha, "checkout_head": sha, "checkout_clean": clean,
                "checkout_matches_pin": sha == self.cfg.pinned_sha and clean, "max_action": self.cfg.max_action, "executor": "dry-run"}

    def op_authorize(self, req: dict) -> dict:
        self._require_pinned("authorize")
        src = packages.resolve_package(self.cfg.workspace_root, req["package"])
        snap_id = uuid.uuid4().hex
        ws = self.store / "snapshots" / snap_id / "ws"
        pkg = ws / "articles" / req["package"]
        try:
            return self._authorize_snapshot(req, src, snap_id, ws, pkg)
        except BaseException:
            shutil.rmtree(self.store / "snapshots" / snap_id, ignore_errors=True)  # a refused authorize leaves nothing behind
            raise

    def _authorize_snapshot(self, req: dict, src: Path, snap_id: str, ws: Path, pkg: Path) -> dict:
        packages.snapshot(src, pkg, max_bytes=self.cfg.max_package_bytes, max_files=self.cfg.max_package_files)
        rc, tail = self.runner.authorize(ws, pkg)
        if rc != 0:
            raise BrokerError("not_authorized", f"canonical evaluator did not authorize (exit {rc}): {tail.strip()[-300:]}")
        vr = self.runner.verify(ws, pkg)
        if not vr.valid or vr.content_sha256 is None:
            raise BrokerError("verification_failed", f"authorize exited 0 but verify failed: {vr.reason}")
        final = (pkg / packages.RELEASE_FINAL).read_bytes()
        sha = hashlib.sha256(final).hexdigest()
        if sha != vr.content_sha256:
            raise BrokerError("content_hash_mismatch", "release bytes differ from the hash the verifier vouched for")
        binding = self._binding(pkg)
        now = int(self.clock())
        doc = keys.sign(self.broker_key, {
            "v": AUTH_VERSION, "auth_id": uuid.uuid4().hex, "package": req["package"], "snapshot_id": snap_id,
            "content_sha256": sha, "pinned_sha": self.cfg.pinned_sha, "issued_at": now, "expires_at": now + self.cfg.auth_ttl_seconds,
            "binding": binding})
        self._atomic_write(self.store / "auth" / f"{doc['auth_id']}.json", json.dumps(doc, indent=1, sort_keys=True).encode())
        return {"auth_id": doc["auth_id"], "content_sha256": sha, "evaluator_id": binding.get("evaluator_id"),
                "expires_at": doc["expires_at"], "bytes": len(final)}

    def op_publish(self, req: dict) -> dict:
        auth = self._load_auth(req["auth_id"])
        action = req["action"]
        if ACTIONS.index(action) > ACTIONS.index(self.cfg.max_action):
            raise BrokerError("action_not_permitted", f"broker policy ceiling is {self.cfg.max_action!r}; {action!r} refused")
        if not req.get("dry_run", True):
            raise BrokerError("executor_not_implemented", "this prototype has no browser executor; only dry_run=true is served")
        self._require_pinned("publish", auth["pinned_sha"])
        ws = self.store / "snapshots" / auth["snapshot_id"] / "ws"
        pkg = ws / "articles" / auth["package"]
        try:
            final = (pkg / packages.RELEASE_FINAL).read_bytes()
        except OSError:
            raise BrokerError("snapshot_missing", "authorized snapshot is gone from the broker store") from None
        if hashlib.sha256(final).hexdigest() != auth["content_sha256"]:
            raise BrokerError("content_hash_mismatch", "snapshot bytes do not match the authorized hash")
        vr = self.runner.verify(ws, pkg)
        if not vr.valid:
            code = "stale_evaluator" if "binding differs" in vr.reason else "verification_failed"
            raise BrokerError(code, f"fresh release verify failed: {vr.reason}")
        if vr.content_sha256 != auth["content_sha256"]:
            raise BrokerError("content_hash_mismatch", "fresh verify vouches for different bytes than the authorization")
        if self._binding(pkg) != auth["binding"]:
            raise BrokerError("binding_mismatch", "snapshot authorization binding differs from the broker authorization")
        editor = DryRunEditor()
        outcome = execute(final, action, req.get("schedule_at"), editor, self.comparator)
        return {"dry_run": True, "would": editor.steps, "compare_wired": self.comparator is not compare_stub, "auth_id": auth["auth_id"],
                "content_sha256": auth["content_sha256"], "outcome": outcome}

    # ---- helpers ------------------------------------------------------------------------------------------
    def _require_pinned(self, what: str, auth_pin: str | None = None) -> None:
        try:
            sha, clean = self.runner.head()
        except OSError as e:
            raise BrokerError("evaluator_unavailable", f"cannot read pinned checkout: {e}") from None
        if not clean:
            raise BrokerError("evaluator_dirty", f"pinned checkout has uncommitted changes; {what} refused")
        if sha != self.cfg.pinned_sha or (auth_pin is not None and auth_pin != sha):
            raise BrokerError("stale_evaluator", f"pinned checkout is at {sha[:12]}, expected {(auth_pin or self.cfg.pinned_sha)[:12]}; {what} refused")

    def _binding(self, pkg: Path) -> dict:
        try:
            b = json.loads((pkg / packages.RELEASE_AUTH).read_text())["binding"]
        except (OSError, ValueError, KeyError):
            raise BrokerError("verification_failed", "snapshot has no readable authorization binding") from None
        if not isinstance(b, dict):
            raise BrokerError("verification_failed", "snapshot binding is malformed")
        return b

    def _load_auth(self, auth_id: str) -> dict:
        if not AUTH_ID_RE.match(auth_id):
            raise BrokerError("bad_auth_id", "bad auth_id")
        path = self.store / "auth" / f"{auth_id}.json"
        try:
            doc = json.loads(path.read_text())
        except OSError:
            raise BrokerError("auth_not_found", "no such authorization") from None
        except ValueError:
            raise BrokerError("auth_invalid", "authorization file is not JSON") from None
        if not isinstance(doc, dict) or not keys.check(self.broker_key, doc):
            raise BrokerError("auth_signature_invalid", "authorization is unsigned or not signed with the broker key")
        need = {"v": int, "auth_id": str, "package": str, "snapshot_id": str, "content_sha256": str, "pinned_sha": str,
                "issued_at": int, "expires_at": int, "binding": dict}
        if any(not isinstance(doc.get(k), t) for k, t in need.items()) or doc["v"] != AUTH_VERSION or doc["auth_id"] != auth_id:
            raise BrokerError("auth_invalid", "authorization fields are malformed")
        if self.clock() > doc["expires_at"]:
            raise BrokerError("auth_expired", "authorization expired; run authorize again")
        return doc

    @staticmethod
    def _atomic_write(path: Path, data: bytes) -> None:
        tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    def _audit(self, rec: dict) -> None:
        line = json.dumps({"ts": int(self.clock()), **rec}, sort_keys=True) + "\n"
        fd = os.open(self.store / "audit.jsonl", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a") as f:
            f.write(line)


def _safe_op(raw: bytes) -> str | None:
    try:
        op = json.loads(raw).get("op")
        return op if isinstance(op, str) and len(op) < 20 else None
    except Exception:  # noqa: BLE001
        return None
