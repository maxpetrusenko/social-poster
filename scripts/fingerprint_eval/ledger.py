"""Append-only ledger.jsonl plus the five-state reconstruction.

The ledger records what happened; it is never proof. `reconstruct` derives requested / executed / valid /
matches-content / authorized from the files themselves (record files, authorization, release bytes, current hashes).
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from .contracts import LEDGER, RELEASE_ARTICLE, RUNS_DIR, Binding, LedgerEvent, LedgerState, PackageCtx, Result
from .record import RecordError, jsonable, list_records, load_authorization, load_record, now_utc


def append(package: Path, state: LedgerState, content_sha256: str, evaluator_id: str, detail: dict | None = None) -> LedgerEvent:
    ev = LedgerEvent(ts_utc=now_utc(), state=state, content_sha256=content_sha256, evaluator_id=evaluator_id, detail=detail or {})
    path = package / LEDGER
    path.parent.mkdir(parents=True, exist_ok=True)
    line = (json.dumps(jsonable(ev), sort_keys=True) + "\n").encode()
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        os.write(fd, line)  # one write(2) per event: O_APPEND keeps concurrent writers from interleaving
        os.fsync(fd)
    finally:
        os.close(fd)
    return ev


def read(package: Path) -> list[LedgerEvent]:
    out: list[LedgerEvent] = []
    try:
        text = (package / LEDGER).read_text()
    except OSError:
        return out
    for line in text.splitlines():
        try:
            d = json.loads(line)
            out.append(LedgerEvent(ts_utc=d["ts_utc"], state=LedgerState(d["state"]), content_sha256=d["content_sha256"],
                                   evaluator_id=d["evaluator_id"], detail=d.get("detail") or {}))
        except (ValueError, KeyError, TypeError):
            continue  # a torn or foreign line is ignored, never trusted
    return out


@dataclass
class States:
    requested: bool = False
    executed: bool = False
    valid: bool = False
    matches_content: bool = False
    authorized: bool = False
    content_sha256: str | None = None
    record_path: str | None = None
    record_result: str | None = None
    reasons: list[str] = field(default_factory=list)


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def reconstruct(ctx: PackageCtx, current: Binding | None, evaluator_dirty: bool = False) -> States:
    """Five booleans from files alone. `current` is the Binding for the package's current final bytes (None if it could not be computed)."""
    st = States()
    pkg = ctx.package
    try:
        cur_sha = _sha(ctx.final_path.read_bytes())
    except OSError as e:
        st.reasons.append(f"cannot read final {ctx.final_path}: {e}")
        return st
    st.content_sha256 = cur_sha
    st.requested = any(e.state is LedgerState.GATE_REQUESTED and e.content_sha256 == cur_sha for e in read(pkg))
    files = sorted((pkg / RUNS_DIR).glob(f"*-{cur_sha[:12]}.json"))
    st.executed = bool(files)
    if not files:
        st.reasons.append("no evaluation record for the current content")
    auth_rec_name = None
    try:
        auth = load_authorization(pkg)
        auth_rec_name = Path(auth.record_path).name
    except RecordError:
        auth = None
    chosen = None
    for p in reversed(files):
        if auth_rec_name and p.name == auth_rec_name:
            chosen = p
            break
    if chosen is None and files:
        chosen = files[-1]
    rec = None
    if chosen is not None:
        try:
            rec = load_record(chosen)
            if rec.binding.content_sha256 != cur_sha:
                raise RecordError("record content hash differs from its file name")
            st.valid, st.record_path, st.record_result = True, str(chosen.relative_to(pkg)), rec.result.value
        except RecordError as e:
            st.reasons.append(f"record invalid: {e}")
    if rec is not None and current is not None:
        st.matches_content = rec.binding == current
        if not st.matches_content:
            st.reasons.append("record binding (content/evaluator/corpus) differs from the current binding")
    # authorized: the authorization names a PASS record whose binding is the current binding, and the release bytes are the final bytes
    if auth is None:
        st.reasons.append("no valid authorization")
    elif current is None:
        st.reasons.append("current binding unavailable")
    elif evaluator_dirty:
        st.reasons.append("evaluator tree is dirty")
    else:
        try:
            arec = load_record(pkg / auth.record_path)
            rel = _sha((pkg / RELEASE_ARTICLE).read_bytes())
            ok = (arec.result is Result.PASS and arec.binding == auth.binding == current and rel == cur_sha == auth.release_article_sha256)
            st.authorized = ok
            if not ok:
                st.reasons.append("authorization does not match the current bytes/evaluator/corpus or its record is not PASS")
        except (RecordError, OSError) as e:
            st.reasons.append(f"authorization unverifiable: {e}")
    return st
