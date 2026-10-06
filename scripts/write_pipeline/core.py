"""Stage table, hash-bound state, input keys, cache and invalidation. No model calls, no network."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from scripts.fingerprint_eval import record as R

from . import PIPELINE_VERSION

# (name, kind, dependencies). kind: agent = semantic work done by the skill's model, cli = executed by this CLI.
STAGES: list[tuple[str, str, tuple[str, ...]]] = [
    ("source", "agent", ()),
    ("research", "agent", ("source",)),
    ("angle", "agent", ("research",)),
    ("outline", "agent", ("angle",)),
    ("brief", "cli", ("outline", "research")),
    ("draft", "agent", ("outline", "research", "brief")),
    ("validate", "agent", ("draft", "research", "source")),
    ("editorial", "agent", ("validate",)),
    ("voice", "agent", ("editorial",)),
    ("antifp", "cli", ("voice",)),
    ("review", "cli", ("antifp",)),
    ("title", "agent", ("antifp", "review")),
    ("images", "agent", ("title", "antifp", "voice")),
    ("critic", "cli", ("images",)),
    ("repair", "agent", ("critic", "images")),
    ("fpverify", "cli", ("repair", "draft", "brief")),
    ("integrity", "cli", ("fpverify", "images")),
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


def safe_path(pkg: Path, rel) -> Path:
    """Resolve rel under pkg. Absolute paths, traversal and symlinks that resolve outside the package are refused."""
    root = Path(pkg).resolve()
    if rel in (None, "") or not isinstance(rel, (str, Path)) or "\x00" in str(rel):
        raise PipelineError(f"invalid path: {rel!r}")
    p = (root / rel).resolve()
    if not p.is_relative_to(root):
        raise PipelineError(f"path escapes the package: {str(rel)[:120]!r}")
    return p


INPUT_ROOTS_ENV = "WRITE_PIPELINE_INPUT_ROOTS"


def input_roots(pkg: Path) -> list[Path]:
    """Directories a caller-supplied input file may live in: the package plus explicit allowlisted roots (os.pathsep separated)."""
    roots = [Path(pkg).resolve()]
    roots += [Path(v).resolve() for v in os.environ.get(INPUT_ROOTS_ENV, "").split(os.pathsep) if v]
    return roots


def contain_input(pkg: Path, path, *, exact: tuple[Path, ...] = ()) -> Path:
    """Resolve a caller-supplied input path (symlinks followed) and require it to sit inside the package or an allowlisted root,
    or to be one of the `exact` allowlisted files. A symlink that escapes resolves outside and is refused."""
    if path in (None, "") or not isinstance(path, (str, Path)) or "\x00" in str(path):
        raise PipelineError(f"invalid input path: {path!r}")
    p = Path(path)
    r = (p if p.is_absolute() else Path.cwd() / p).resolve()
    if r in exact or any(r.is_relative_to(x) for x in input_roots(pkg)):
        return r
    raise PipelineError(f"input path is outside the package and the allowlisted roots ({INPUT_ROOTS_ENV}): {str(path)[:120]!r}")


def read_input(pkg: Path, path) -> bytes:
    return contain_input(pkg, path).read_bytes()


def _check_shape(d: dict) -> None:
    if not isinstance(d.get("stages"), dict) or not all(isinstance(v, dict) and isinstance(v.get("status"), str) for v in d["stages"].values()):
        raise PipelineError("stages malformed")
    if d["stages"].keys() - set(NAMES):
        raise PipelineError("unknown stage in state")
    t = d.get("terminal")
    if t is not None and not (isinstance(t, dict) and t.get("stage") in NAMES and isinstance(t.get("state"), str)):
        raise PipelineError("terminal malformed")
    if not isinstance(d.get("overrides", []), list):
        raise PipelineError("overrides malformed")
    for k in ("critic", "fpverify", "rework", "rework_seen", "repair_cuts", "fingerprint_rejections"):
        if d.get(k) is not None and not isinstance(d[k], (dict, list)):
            raise PipelineError(f"{k} malformed")
    for k in ("framework", "final", "candidate"):
        if d.get(k) is not None and not isinstance(d[k], dict):
            raise PipelineError(f"{k} malformed")


class Pipeline:
    def __init__(self, package: Path):
        self.pkg = Path(package).resolve()
        self.path = self.pkg / STATE_REL
        self._memo: dict | None = None
        self.final_verifier = None  # callable(Pipeline) -> list[str] of failures; None means READY_FOR_REVIEW can never be reported
        self.state = self._load()
        if self.state.get("invalid") and not self.path.exists():
            self.save()

    def mark_invalid(self, reason: str) -> None:
        """Persist a NOT_READY state: unusable input is a recorded outcome, never an uncaught exception."""
        self.state["invalid"] = {"reason": reason[:300], "at": now()}
        self.state["awaiting_review"] = False
        self.log("invalid", reason=reason[:300])
        self.save()

    # ---- persistence -----------------------------------------------------------------------------------------
    def _fresh(self) -> dict:
        return {"schema": 1, "pipeline_version": PIPELINE_VERSION, "slug": self.pkg.name, "stages": {}, "terminal": None,
                "final": None, "published": False, "overrides": [], "user_modified": None}

    def _load(self) -> dict:
        if not self.path.exists():
            return self._fresh()
        try:
            d = json.loads(self.path.read_text())
            if not isinstance(d, dict):
                raise PipelineError("state.json is not a pipeline state")
            _check_shape(d)
            R.check_signature(d, "state.json")  # HMAC with the record key: a hand-edited or unsigned state is never trusted
            for n, r in d["stages"].items():
                R.check_signature(r, f"stage record {n}")
        except (OSError, ValueError, PipelineError, R.RecordError) as e:
            return self._quarantine(f"state.json rejected: {type(e).__name__}: {e}")
        return d

    def _quarantine(self, reason: str) -> dict:
        """The bad state file is kept aside (never deleted), and a fresh NOT_READY state replaces it."""
        try:
            raw = self.path.read_bytes()
            self.path.replace(self.path.with_name(f"state.json.invalid-{sha_bytes(raw)[:8]}"))
        except OSError:
            pass
        d = self._fresh()
        d["invalid"] = {"reason": reason[:300], "at": now()}
        return d

    @property
    def initialized(self) -> bool:
        return self.path.exists()

    def save(self) -> None:
        self.state["published"] = False  # no code path in this package publishes; the flag exists so a reader can check it
        for r in self.state["stages"].values():
            r[R.SIG_FIELD] = R.sign(r)
        self.state[R.SIG_FIELD] = R.sign(self.state)
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
        if self._memo is not None:
            return self._status(stage)
        self._memo = {}  # one status call hashes each tracked file once; never reused across calls
        try:
            return self._status(stage)
        finally:
            self._memo = None

    def _status(self, stage: str) -> str:
        if self._memo is not None and stage in self._memo:
            return self._memo[stage]
        out = self._status_uncached(stage)
        if self._memo is not None:
            self._memo[stage] = out
        return out

    def _status_uncached(self, stage: str) -> str:
        r = self.rec(stage)
        if r is None:
            return PENDING if all(self._status(d) == DONE for d in DEPS[stage]) else WAITING
        st = r["status"]
        cand = (self.state.get("candidate") or {}).get("sha256")
        if stage == "critic" and r.get("candidate_sha256") and cand and r["candidate_sha256"] != cand:
            return STALE  # the candidate changed (a repair was accepted): the critic must look at the new bytes
        if st == DONE or st in TERMINAL:
            if r.get("inputs") != self.input_shas(stage) or r.get("stale_reason") or any(self._status(d) != DONE for d in DEPS[stage]):
                return STALE
            if not self.files_current(r):  # recorded hashes are never trusted: the bytes on disk now must match
                return STALE
        return st

    def files_current(self, r: dict) -> bool:
        """Re-hash every artifact and external file the record depends on, from disk, now."""
        files = r.get("files") or {}
        if any(r.get(k) and r[k] not in files for k in ("artifact", "report", "reference_frame")):
            return False  # a path in the record that was never hashed (state edited by hand)
        for rel, want in files.items():
            try:
                if want is None or sha_bytes(safe_path(self.pkg, rel).read_bytes()) != want:
                    return False
            except (OSError, PipelineError):
                return False
        return True

    def input_key(self, stage: str) -> str:
        return sha_json(self.input_shas(stage))

    def can_run(self, stage: str) -> tuple[bool, str]:
        if self.state.get("invalid"):
            return False, f"pipeline state is invalid: {self.state['invalid'].get('reason')}"
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
        r["files"] = self._track(r)
        self.state["stages"][stage] = r
        if status in TERMINAL:
            self.state["terminal"] = {"stage": stage, "state": status, "reason": "; ".join(reasons or [])[:400]}
        elif self.state.get("terminal") and self.state["terminal"]["stage"] == stage:
            self.state["terminal"] = None
        self.log("stage", stage=stage, status=status, bundle=bundle, reasons=reasons or [])
        return r

    def _track(self, r: dict) -> dict:
        files: dict = {}
        for rel in (r.get("artifact"), r.get("report"), r.get("reference_frame")):
            if rel:
                try:
                    files[rel] = sha_bytes(safe_path(self.pkg, rel).read_bytes())
                except (OSError, PipelineError):
                    files[rel] = None
        files.update(r.get("external") or {})
        return files

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
        atomic_write(safe_path(self.pkg, rel), data)
        return str(rel)

    def read_art(self, stage: str) -> str | None:
        r = self.rec(stage)
        if not r or not r.get("artifact"):
            return None
        p = safe_path(self.pkg, r["artifact"])
        return p.read_text() if p.exists() else None

    def read_json(self, stage: str, key: str = "artifact") -> dict:
        r = self.rec(stage) or {}
        rel = r.get(key)
        try:
            d = json.loads(safe_path(self.pkg, rel).read_text()) if rel else {}
        except (OSError, ValueError, PipelineError):
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
        if self.state.get("invalid"):
            return NOT_READY
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
            if self.read_json("package").get("route_code") not in READY_ROUTES:  # a quarantined (D) or unknown route is never ready
                return QUARANTINED
            return NOT_READY if self.verify_final() else "READY_FOR_REVIEW"
        return "IN_PROGRESS"

    def verify_final(self, before_stop: bool = False) -> list[str]:
        """Independent recomputation of everything READY_FOR_REVIEW claims, from the files on disk. Empty list = verified."""
        if self.final_verifier is None:
            return ["no final verifier is configured: READY_FOR_REVIEW is never reported unverified"]
        try:
            return list(self.final_verifier(self, before_stop))
        except Exception as e:  # noqa: BLE001  fail closed
            return [f"final verification could not run: {type(e).__name__}: {str(e)[:200]}"]


READY_ROUTES = ("A", "B", "C")


def fail_exc(pipe: Pipeline, stage: str, e: BaseException) -> dict:
    """Stage boundary: an unexpected exception is persisted, never left to escape with pending state.
    I/O trouble is BLOCKED (retry); anything else is FAILED, or NOT_READY for the final-gate stages."""
    msg = [f"{type(e).__name__}: {str(e)[:200]}"]
    infra = isinstance(e, (OSError, subprocess.SubprocessError)) and not isinstance(e, UnicodeError)
    if infra:
        pipe.set(stage, BLOCKED, reasons=msg, extra={"category": "DEPENDENCY_FAILURE"})
        code = "BLOCKED"
    elif NUM[stage] >= NUM["fpverify"]:
        pipe.set(stage, NOT_READY, reasons=msg)
        code = "NOT_READY"
    else:
        pipe.set(stage, FAILED, reasons=msg)
        code = "INVALID"
    pipe.save()
    return {"ok": False, "code": code, "stage": stage, "reasons": msg}
