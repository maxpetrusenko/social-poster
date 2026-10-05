"""Broker key handling. Keys live under the broker user's store dir (0700), mode 0600, owned by the broker's uid.

Nothing here is reachable by the publishing agent when the broker runs as a different OS user and the store dir is
0700 under that user's own group (see docs/publish-boundary.md). The checks below also refuse a key that is a symlink,
owned by someone else, or readable by group/other, so a mis-provisioned install fails loudly instead of silently
degrading to the same-user residual."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import stat
from pathlib import Path

SIG_FIELD = "broker_hmac_sha256"


class KeyProblem(Exception):
    pass


def _check(path: Path, st: os.stat_result) -> None:
    if not stat.S_ISREG(st.st_mode):
        raise KeyProblem(f"{path}: not a regular file")
    if st.st_uid != os.geteuid():
        raise KeyProblem(f"{path}: owned by uid {st.st_uid}, expected the broker uid {os.geteuid()}")
    if st.st_mode & 0o077:
        raise KeyProblem(f"{path}: mode {oct(st.st_mode & 0o777)} lets group/other read it; expected 0600")


def load_key(path: Path, *, create: bool = False) -> bytes:
    path = Path(path)
    if create and not path.is_symlink() and not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as f:
                f.write(os.urandom(32).hex().encode())
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as e:
        raise KeyProblem(f"{path}: cannot open key ({e.strerror})") from None
    with os.fdopen(fd, "rb") as f:
        _check(path, os.fstat(f.fileno()))
        key = f.read().strip()
    if len(key) < 32:
        raise KeyProblem(f"{path}: key too short")
    return key


def canonical(obj: dict) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def sign(key: bytes, doc: dict) -> dict:
    body = {k: v for k, v in doc.items() if k != SIG_FIELD}
    return {**body, SIG_FIELD: hmac.new(key, canonical(body), hashlib.sha256).hexdigest()}


def check(key: bytes, doc: dict) -> bool:
    sig = doc.get(SIG_FIELD)
    if not isinstance(sig, str) or not sig:
        return False
    body = {k: v for k, v in doc.items() if k != SIG_FIELD}
    return hmac.compare_digest(sig, hmac.new(key, canonical(body), hashlib.sha256).hexdigest())
