"""Request/response schema for the publish broker. Newline-delimited JSON, one request per connection.

The client names a package (a slug) or an authorization id. It can never send article bytes: the broker reads the
bytes from its own snapshot. Unknown fields are rejected, and the usual names for content get their own error code
so a client that tries to smuggle bytes in is told exactly why it was refused.

  {"v":1,"op":"status"}
  {"v":1,"op":"authorize","package":"<slug>"}
  {"v":1,"op":"publish","auth_id":"<32 hex>","action":"draft|schedule|publish","schedule_at":"<ISO8601 with tz>","dry_run":true}

Responses: {"ok":true,"result":{...}} or {"ok":false,"error":{"code":"...","message":"..."}}.
"""
from __future__ import annotations

import json
import re
from datetime import datetime

PROTOCOL = 1
MAX_REQUEST_BYTES = 64 * 1024
ACTIONS = ("draft", "schedule", "publish")  # ordered: a policy ceiling of "schedule" also allows "draft"
SLUG_RE = re.compile(r"[a-z0-9][a-z0-9._-]{0,127}\Z")  # \Z, not $: "$" would accept a trailing newline
AUTH_ID_RE = re.compile(r"[0-9a-f]{32}\Z")
CONTENT_KEYS = frozenset({"content", "markdown", "md", "bytes", "body", "html", "text", "release_md", "release", "article",
                          "data", "final", "payload", "file", "path", "package_path", "authorization", "auth"})
ALLOWED_FIELDS = {
    "status": {"v", "op"},
    "authorize": {"v", "op", "package"},
    "publish": {"v", "op", "auth_id", "action", "schedule_at", "dry_run"},
}


class BrokerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code, self.message = code, message


def ok(result: dict) -> dict:
    return {"ok": True, "result": result}


def err(code: str, message: str) -> dict:
    return {"ok": False, "error": {"code": code, "message": message}}


def parse_request(raw: bytes) -> dict:
    if len(raw) > MAX_REQUEST_BYTES:
        raise BrokerError("request_too_large", f"request exceeds {MAX_REQUEST_BYTES} bytes; the broker takes package refs, never content")
    try:
        req = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise BrokerError("bad_json", "request is not valid UTF-8 JSON") from None
    if not isinstance(req, dict):
        raise BrokerError("bad_request", "request must be a JSON object")
    if req.get("v") != PROTOCOL:
        raise BrokerError("bad_version", f"expected v={PROTOCOL}")
    op = req.get("op")
    if not isinstance(op, str) or op not in ALLOWED_FIELDS:
        raise BrokerError("unknown_op", f"op must be one of {sorted(ALLOWED_FIELDS)}")
    content = sorted(k for k in req if k in CONTENT_KEYS)
    if content:
        raise BrokerError("content_not_accepted", f"field(s) {content} refused: send a package ref or auth_id, the broker never accepts article bytes, paths or authorization documents")
    extra = sorted(set(req) - ALLOWED_FIELDS[op])
    if extra:
        raise BrokerError("unknown_field", f"field(s) {extra} not allowed for op {op}")
    if op == "authorize":
        pkg = req.get("package")
        if not isinstance(pkg, str) or not SLUG_RE.match(pkg) or ".." in pkg:
            raise BrokerError("bad_package_ref", "package must be a slug [a-z0-9._-], not a path")
    if op == "publish":
        aid = req.get("auth_id")
        if not isinstance(aid, str) or not AUTH_ID_RE.match(aid):
            raise BrokerError("bad_auth_id", "auth_id must be 32 lowercase hex characters")
        if req.get("action") not in ACTIONS:
            raise BrokerError("bad_action", f"action must be one of {list(ACTIONS)}")
        if not isinstance(req.get("dry_run", True), bool):
            raise BrokerError("bad_request", "dry_run must be a boolean")
        sched = req.get("schedule_at")
        if req["action"] == "schedule":
            if not isinstance(sched, str):
                raise BrokerError("bad_schedule", "schedule requires schedule_at (ISO8601 with timezone)")
            try:
                if datetime.fromisoformat(sched).tzinfo is None:
                    raise ValueError
            except ValueError:
                raise BrokerError("bad_schedule", "schedule_at must be ISO8601 with a timezone") from None
        elif sched is not None:
            raise BrokerError("bad_schedule", "schedule_at is only valid with action=schedule")
    return req
