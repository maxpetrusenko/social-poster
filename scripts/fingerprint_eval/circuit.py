"""Per-dependency circuit breaker persisted in CIRCUITS_FILE (atomic writes, injectable clock).

closed --(CIRCUIT_FAILURE_THRESHOLD consecutive failures)--> open
open --(cooldown elapsed, allow())--> half_open (exactly one probe call allowed)
half_open --success--> closed ; half_open --failure--> open (cooldown restarts)
Every transition is logged and appended to the dependency's `transitions` list in the state file.
"""
from __future__ import annotations

import fcntl
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .contracts import CIRCUIT_COOLDOWN_SECONDS, CIRCUIT_FAILURE_THRESHOLD, CIRCUITS_FILE, DEPENDENCIES

log = logging.getLogger("fingerprint_eval.circuit")
def default_workspace() -> Path:
    env = os.environ.get("FINGERPRINT_EVAL_WORKSPACE")
    return Path(env) if env else Path(__file__).resolve().parents[2] / "data" / "article-workspace"

MAX_TRANSITIONS = 50


def _atomic_write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def _ts(iso: str | None) -> float | None:
    return None if iso is None else datetime.fromisoformat(iso).timestamp()


def _blank() -> dict:
    return {"state": "closed", "consecutive_failures": 0, "opened_at": None, "next_probe_at": None, "last_category": None, "transitions": []}


class Circuit:
    def __init__(self, dependency: str, workspace: Path | None = None, clock: Callable[[], float] = time.time,
                 threshold: int = CIRCUIT_FAILURE_THRESHOLD, cooldown: float = CIRCUIT_COOLDOWN_SECONDS):
        if dependency not in DEPENDENCIES:
            raise ValueError(f"unknown dependency {dependency!r}; expected one of {DEPENDENCIES}")
        self.dependency = dependency
        self.path = Path(workspace or default_workspace()) / CIRCUITS_FILE
        self.clock, self.threshold, self.cooldown = clock, threshold, cooldown

    # ---- persistence (read-modify-write under an flock so concurrent queues don't clobber) ----
    def _load_all(self) -> dict:
        try:
            data = json.loads(self.path.read_text())
            return data if isinstance(data, dict) else {}
        except FileNotFoundError:
            return {}
        except (OSError, json.JSONDecodeError):
            log.warning("circuit state unreadable at %s; treating as closed", self.path)
            return {}

    def _update(self, fn: Callable[[dict], object]):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path.with_name(self.path.name + ".lock"), "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            allstate = self._load_all()
            st = {**_blank(), **allstate.get(self.dependency, {})}
            out = fn(st)
            allstate[self.dependency] = st
            _atomic_write(self.path, allstate)
            return out

    def _transition(self, st: dict, new: str, why: str) -> None:
        old = st["state"]
        if old == new:
            return
        st["state"] = new
        st["transitions"] = (st["transitions"] + [{"ts": _iso(self.clock()), "from": old, "to": new, "why": why}])[-MAX_TRANSITIONS:]
        log.warning("circuit %s: %s -> %s (%s)", self.dependency, old, new, why)

    # ---- public API ----
    def state(self) -> dict:
        return {**_blank(), **self._load_all().get(self.dependency, {})}

    def allow(self) -> bool:
        """May a call to this dependency be made now? Moves open -> half_open once the cooldown elapsed (one probe)."""
        def f(st: dict) -> bool:
            now = self.clock()
            if st["state"] == "closed":
                return True
            if st["state"] == "open":
                if _ts(st["next_probe_at"]) is not None and now >= _ts(st["next_probe_at"]):
                    self._transition(st, "half_open", "cooldown elapsed; probe allowed")
                    st["next_probe_at"] = _iso(now + self.cooldown)  # a probe that never reports back is retried after another cooldown
                    return True
                return False
            # half_open: the single probe is in flight; allow another only if it never reported back
            if _ts(st["next_probe_at"]) is not None and now >= _ts(st["next_probe_at"]):
                st["next_probe_at"] = _iso(now + self.cooldown)
                return True
            return False
        return self._update(f)

    def record_success(self) -> None:
        def f(st: dict) -> None:
            st["consecutive_failures"] = 0
            st["opened_at"] = st["next_probe_at"] = None
            self._transition(st, "closed", "success")
        self._update(f)

    def record_failure(self, category=None) -> None:
        def f(st: dict) -> None:
            now = self.clock()
            st["consecutive_failures"] += 1
            st["last_category"] = getattr(category, "value", category)
            if st["state"] == "half_open":
                self._transition(st, "open", "half-open probe failed")
            elif st["state"] == "closed" and st["consecutive_failures"] >= self.threshold:
                self._transition(st, "open", f"{st['consecutive_failures']} consecutive failures")
            else:
                return
            st["opened_at"] = _iso(now)
            st["next_probe_at"] = _iso(now + self.cooldown)
        self._update(f)

    @property
    def is_open(self) -> bool:
        return self.state()["state"] != "closed"
