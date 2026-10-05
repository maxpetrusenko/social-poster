"""Stage table, hash-bound state, input keys, cache and invalidation. No model calls, no network."""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import PIPELINE_VERSION

# (name, kind, dependencies). kind: agent = semantic work done by the skill's model, cli = executed by this CLI.
STAGES: list[tuple[str, str, tuple[str, ...]]] = [
    ("source", "agent", ()),
    ("research", "agent", ("source",)),
    ("angle", "agent", ("research",)),
    ("outline", "agent", ("angle",)),
    ("draft", "agent", ("outline", "research")),
    ("validate", "agent", ("draft", "research", "source")),
    ("editorial", "agent", ("validate",)),
    ("voice", "agent", ("editorial",)),
    ("antifp", "cli", ("voice",)),
    ("review", "cli", ("antifp",)),
    ("title", "agent", ("antifp", "review")),
    ("images", "agent", ("title", "antifp", "voice")),
    ("critic", "cli", ("images",)),
    ("repair", "agent", ("critic", "images")),
    ("integrity", "cli", ("repair", "images")),
    ("hash", "cli", ("integrity",)),
    ("package", "cli", ("hash", "review")),
    ("stop", "cli", ("package",)),
]
NAMES = [s[0] for s in STAGES]
KIND = {n: k for n, k, _ in STAGES}
DEPS = {n: d for n, _, d in STAGES}
NUM = {n: i + 1 for i, n in enumerate(NAMES)}

DONE, STALE, FAILED, BLOCKED, NOT_READY, QUARANTINED, PENDING, WAITING = (
    "DONE", "STALE", "FAILED", "BLOCKED", "NOT_READY", "QUARANTINED", "PENDING", "WAITING")
TERMINAL = (NOT_READY, QUARANTINED)

STATE_REL = Path("write-pipeline") / "state.json"
ART_REL = Path("write-pipeline") / "artifacts"
LOG_REL = Path("write-pipeline") / "log.jsonl"
FINAL_NAME = "FINAL.md"


def sha_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha_file(p: Path) -> str:
    return sha_bytes(Path(p).read_bytes())


def sha_json(obj) -> str:
    return sha_bytes(json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class PipelineError(Exception):
    pass


class Pipeline:
    def __init__(self, package: Path):
        self.pkg = Path(package).resolve()
        self.path = self.pkg / STATE_REL
        self.state = self._load()

    # ---- persistence -----------------------------------------------------------------------------------------
    def _load(self) -> dict:
        if not self.path.exists():
            return {"schema": 1, "pipeline_version": PIPELINE_VERSION, "slug": self.pkg.name, "stages": {}, "terminal": None,
                    "final": None, "published": False, "overrides": [], "user_modified": None}
        try:
            d = json.loads(self.path.read_text())
        except (OSError, ValueError) as e:
            raise PipelineError(f"state.json unreadable: {e}") from None
        if not isinstance(d, dict) or "stages" not in d:
            raise PipelineError("state.json is not a pipeline state")
        return d

    @property
    def initialized(self) -> bool:
        return self.path.exists()

    def save(self) -> None:
        self.state["published"] = False  # no code path in this package publishes; the flag exists so a reader can check it
        atomic_write(self.path, (json.dumps(self.state, indent=1, sort_keys=True) + "\n").encode())

    def log(self, event: str, **kw) -> None:
        p = self.pkg / LOG_REL
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a") as fh:
            fh.write(json.dumps({"at": now(), "event": event, **kw}, sort_keys=True) + "\n")

    # ---- stage records ---------------------------------------------------------------------------------------
    def rec(self, stage: str) -> dict | None:
        return self.state["stages"].get(stage)

    def bundle(self, stage: str) -> str | None:
        """Hash of a completed, still-current stage output; None when the stage is not DONE."""
        return (self.rec(stage) or {}).get("bundle_sha256") if self.status(stage) == DONE else None

    def input_shas(self, stage: str) -> dict[str, str | None]:
        extra = {"_v": PIPELINE_VERSION, "_f": (self.state.get("framework") or {}).get("sha256")}
        return {**extra, **{d: self._raw_bundle(d) for d in DEPS[stage]}}

    def _raw_bundle(self, stage: str) -> str | None:
        r = self.rec(stage)
        return r.get("bundle_sha256") if r and r.get("status") == DONE else None

    def status(self, stage: str) -> str:
        r = self.rec(stage)
        if r is None:
            return PENDING if all(self.status(d) == DONE for d in DEPS[stage]) else WAITING
        st = r["status"]
        cand = (self.state.get("candidate") or {}).get("sha256")
        if stage == "critic" and r.get("candidate_sha256") and cand and r["candidate_sha256"] != cand:
            return STALE  # the candidate changed (a repair was accepted): the critic must look at the new bytes
        if st == DONE or st in TERMINAL:
            if r.get("inputs") != self.input_shas(stage) or r.get("stale_reason") or any(self.status(d) != DONE for d in DEPS[stage]):
                return STALE
        return st

    def input_key(self, stage: str) -> str:
        return sha_json(self.input_shas(stage))

    def can_run(self, stage: str) -> tuple[bool, str]:
        for d in DEPS[stage]:
            if self.status(d) != DONE:
                return False, f"upstream stage '{d}' is {self.status(d)}"
        t = self.terminal()
        if t and NUM[t["stage"]] < NUM[stage]:
            return False, f"pipeline is {t['state']} at '{t['stage']}': {t['reason']}"
        return True, ""

    def terminal(self) -> dict | None:
        t = self.state.get("terminal")
        if not t:
            return None
        s = t["stage"]
        r = self.rec(s)
        if r is None or self.status(s) != t["state"]:  # its inputs or candidate changed: the verdict no longer applies
            self.state["terminal"] = None
            return None
        return t

    def set(self, stage: str, status: str, *, bundle: str | None = None, artifact: str | None = None, reasons: list[str] | None = None,
            extra: dict | None = None) -> dict:
        prev = self.rec(stage) or {}
        r = {"status": status, "inputs": self.input_shas(stage), "bundle_sha256": bundle, "artifact": artifact, "at": now(),
             "attempts": prev.get("attempts", 0) + 1, "reasons": reasons or [], **(extra or {})}
        self.state["stages"][stage] = r
        if status in TERMINAL:
            self.state["terminal"] = {"stage": stage, "state": status, "reason": "; ".join(reasons or [])[:400]}
        elif self.state.get("terminal") and self.state["terminal"]["stage"] == stage:
            self.state["terminal"] = None
        self.log("stage", stage=stage, status=status, bundle=bundle, reasons=reasons or [])
        return r

    def invalidate(self, stages: list[str], reason: str) -> list[str]:
        hit = []
        for s in stages:
            r = self.rec(s)
            if r and r["status"] in (DONE, *TERMINAL):
                r["stale_reason"] = reason
                hit.append(s)
        if hit:
            self.log("invalidate", stages=hit, reason=reason)
        return hit

    def store(self, stage: str, name: str, data: bytes) -> str:
        rel = ART_REL / f"{NUM[stage]:02d}-{stage}.{name}"
        atomic_write(self.pkg / rel, data)
        return str(rel)

    def read_art(self, stage: str) -> str | None:
        r = self.rec(stage)
        if not r or not r.get("artifact"):
            return None
        p = self.pkg / r["artifact"]
        return p.read_text() if p.exists() else None

    def read_json(self, stage: str, key: str = "artifact") -> dict:
        r = self.rec(stage) or {}
        rel = r.get(key)
        try:
            d = json.loads((self.pkg / rel).read_text()) if rel else {}
        except (OSError, ValueError):
            d = {}
        return d if isinstance(d, dict) else {}

    def downstream(self, stage: str) -> list[str]:
        out = []
        for n in NAMES:
            if NUM[n] > NUM[stage] and (stage in DEPS[n] or any(d in out for d in DEPS[n])):
                out.append(n)
        return out

    def overall(self) -> str:
        """One word for the whole run."""
        um = self.state.get("user_modified")
        if um and not um.get("adopted_sha256"):  # adopted = revalidate has taken the edit as the new candidate and is re-proving it
            return "USER_MODIFIED"
        t = self.terminal()
        if t:
            return t["state"]
        for n in NAMES:
            r = self.rec(n)
            if r and r["status"] == BLOCKED and self.status(n) == BLOCKED:
                return "BLOCKED"
        if self.status("stop") == DONE:
            return "READY_FOR_REVIEW"
        return "IN_PROGRESS"
