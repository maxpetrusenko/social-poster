"""Self-healing loop around the canonical gate.

Content path: repair -> new bytes -> new hash -> gate_fn on the NEW bytes. Only gate_fn can produce PASS.
Infra path: bounded backoff, allowlisted probes, APPROVED_FALLBACKS, circuit breakers; article bytes are never touched.
"""
from __future__ import annotations

import dataclasses
import hashlib
import importlib
import json
import logging
import os
import subprocess
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .circuit import Circuit
from .classify import classify, failure_categories
from .contracts import (APPROVED_FALLBACKS, CONTENT_CATEGORIES, INFRA_BACKOFF_SECONDS, INFRA_CATEGORIES, MAX_REPAIR_CYCLES,
                        QUARANTINE, Binding, Category, EvalRecord, GateFn, HealCycle, HealOutcome, PackageCtx, Repairer, Result)
from .errors import EvaluationError
from .repair import DeterministicRepairer

log = logging.getLogger("fingerprint_eval.heal")

FallbackGateFn = Callable[[PackageCtx, Path, str], EvalRecord]
CIRCUIT_CATEGORIES = {Category.MODEL_TIMEOUT, Category.MODEL_UNAVAILABLE, Category.GATEWAY_FAILURE, Category.DEPENDENCY_FAILURE}
MODEL_CATEGORIES = {Category.MODEL_TIMEOUT, Category.MODEL_UNAVAILABLE, Category.MALFORMED_MODEL_OUTPUT, Category.GATEWAY_FAILURE}
RETRY_LIMITS = {Category.STALE_EVALUATION: 1, Category.UNKNOWN_ERROR: 1, Category.DEPENDENCY_FAILURE: 1,
                Category.MODEL_TIMEOUT: len(INFRA_BACKOFF_SECONDS), Category.GATEWAY_FAILURE: len(INFRA_BACKOFF_SECONDS),
                Category.MODEL_UNAVAILABLE: 0, Category.MALFORMED_MODEL_OUTPUT: 0}
PROBE_FOR_DEP = {"gateway-chat": "gateway-models", "gateway-embed": "gateway-models", "claude-cli": "claude-ping",
                 "codex-cli": "codex-version", "doppler": "doppler-env"}


# ---- allowlisted health probes (no arbitrary shell, no remote restarts) ----------------------------------------------
def _probe_gateway() -> bool:
    from . import gateway
    req = urllib.request.Request(f"{gateway.BASE_URL}/models", headers={"Authorization": f"Bearer {gateway._key()}", "User-Agent": "fingerprint-eval/1.0 (curl-compatible)"})
    with urllib.request.urlopen(req, timeout=10, context=gateway._ssl_ctx()) as r:
        return 200 <= r.status < 300


def _probe_claude() -> bool:
    from . import gateway
    return bool(gateway.claude_cli("Reply with the single word ok.", timeout=60))


def _probe_codex() -> bool:
    exe = os.environ.get("CODEX_BIN") or "codex"
    return subprocess.run([exe, "--version"], capture_output=True, timeout=15).returncode == 0


def _probe_doppler() -> bool:
    return bool(os.environ.get("LLM_GATEWAY_API_KEY"))


DEFAULT_PROBES: dict[str, Callable[[], bool]] = {"gateway-models": _probe_gateway, "claude-ping": _probe_claude,
                                                 "codex-version": _probe_codex, "doppler-env": _probe_doppler}
ALLOWED_PROBES = frozenset(DEFAULT_PROBES)


def run_probe(name: str, probes: dict[str, Callable[[], bool]]) -> bool:
    if name not in ALLOWED_PROBES:
        raise ValueError(f"probe {name!r} is not allowlisted")
    try:
        return bool(probes[name]())
    except Exception as e:  # noqa: BLE001  a failing probe is a data point, not a crash
        log.info("probe %s failed: %s", name, type(e).__name__)
        return False


def get_repairer() -> Repairer:
    """The deterministic repairer. FINGERPRINT_EVAL_REPAIRER=module:attr overrides it ONLY in FINGERPRINT_EVAL_TEST_MODE=1."""
    spec = os.environ.get("FINGERPRINT_EVAL_REPAIRER")
    if spec:
        if os.environ.get("FINGERPRINT_EVAL_TEST_MODE") != "1":
            log.warning("ignoring FINGERPRINT_EVAL_REPAIRER=%s: FINGERPRINT_EVAL_TEST_MODE is not 1", spec)
        else:
            mod, _, attr = spec.partition(":")
            obj = getattr(importlib.import_module(mod), attr)
            return obj() if isinstance(obj, type) else obj
    return DeterministicRepairer()


# ---- helpers ------------------------------------------------------------------------------------------------------------
def sha256_file(p: Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _val(x):
    return getattr(x, "value", x)


def cycle_dict(c: HealCycle) -> dict:
    """dataclasses.asdict with enums as string values (the HEAL_CYCLE ledger detail)."""
    return {k: _val(v) for k, v in dataclasses.asdict(c).items()}


def _error_record(ctx: PackageCtx, path: Path, exc: EvaluationError) -> EvalRecord:
    h = sha256_file(path)
    rec = EvalRecord(schema_version=1, slug=ctx.slug, binding=Binding(h, "", ""), final_path=str(path), final_rule=ctx.final_rule,
                     reference_path=str(ctx.reference_path) if ctx.reference_path else None, reference_sha256=None,
                     reference_identical=False, timestamp_utc=_now(), evaluator_tree_sha256="", pipeline_corpus_sha256="",
                     models={}, claims={}, links={}, structure={}, semantic={}, advisory={}, result=Result.ERROR,
                     category=getattr(exc, "category", Category.UNKNOWN_ERROR), reasons=[str(exc)[:300]], runtime_s=0.0, raw_report_path="")
    rec.dependency = getattr(exc, "dependency", None)  # type: ignore[attr-defined]
    return rec


def _dependency(record: EvalRecord, cat: Category) -> str:
    dep = getattr(record, "dependency", None)
    if dep:
        return dep
    if cat is Category.DEPENDENCY_FAILURE:
        return "doppler"
    if cat is Category.GATEWAY_FAILURE:
        return "gateway-chat"
    backend = ((getattr(record, "models", None) or {}).get("judge") or {}).get("backend", "claude-cli")
    return {"claude-cli": "claude-cli", "codex-cli": "codex-cli"}.get(backend, "gateway-chat")


def _model_key(record: EvalRecord, active: str | None, dep: str) -> str | None:
    """Key into APPROVED_FALLBACKS for the model that just failed."""
    if active:
        return active
    if dep == "gateway-embed":
        return "nomic-embed-text:latest"
    models = getattr(record, "models", None) or {}
    for role in ("judge", "extractor"):
        m = models.get(role) or {}
        for k in (m.get("spec"), m.get("name"), f"{m.get('backend', '')}:{m.get('version', '')}"):
            if k in APPROVED_FALLBACKS:
                return k
        name = str(m.get("name", ""))
        if name.startswith("claude-") and f"claude:{name[7:]}" in APPROVED_FALLBACKS:
            return f"claude:{name[7:]}"
    return "claude:sonnet"


def _fallback_dep(model: str) -> str:
    return "claude-cli" if model.startswith("claude") else "codex-cli" if model.startswith(("codex", "gpt")) else "gateway-chat"


_SEVERITY = {Result.PASS: 0, Result.FAIL: 1, Result.ERROR: 2}


def _score(record: EvalRecord) -> int:
    links = getattr(record, "links", None) or {}
    claims = getattr(record, "claims", None) or {}
    struct = getattr(record, "structure", None) or {}
    diffs = sum(len(v.get("diffs") or v.get("missing") or []) for v in struct.values() if isinstance(v, dict))
    return (len(links.get("missing") or []) + diffs + sum(int(claims.get(k) or 0) for k in ("changed", "missing", "added_unsupported")))


def is_worse(old: EvalRecord, new: EvalRecord) -> bool:
    """More failures or different failure kinds than before the repair."""
    if new.result == Result.ERROR:
        return False  # unevaluated, not worse
    if _SEVERITY[Result(_val(new.result))] > _SEVERITY[Result(_val(old.result))]:
        return True
    if new.result == Result.PASS:
        return False
    return not set(failure_categories(new)) <= set(failure_categories(old)) or _score(new) > _score(old)


def write_quarantine(ctx: PackageCtx, category: Category, kind: str, record: EvalRecord | None, cycles: list[HealCycle],
                     path: Path, reason: str, last_category: Category | None = None) -> Path:
    artifacts = sorted({str(c_path) for c_path in (ctx.package.glob("article-healed-*.md"))})
    if record is not None and record.raw_report_path:
        artifacts.append(record.raw_report_path)
    doc = {"status": "NEEDS_REVIEW", "category": category.value, "kind": kind, "retryable": kind == "infra",
           "created_at_utc": _now(), "content_sha256": sha256_file(path),
           "evaluator_id": record.binding.evaluator_id if record is not None else "",
           "cycles": [cycle_dict(c) for c in cycles], "artifacts": artifacts, "slug": ctx.slug, "reason": reason,
           "last_category": (last_category or category).value, "final_path": str(path)}
    dest = ctx.package / QUARANTINE
    fd, tmp = tempfile.mkstemp(prefix=".QUARANTINE.", suffix=".tmp", dir=ctx.package)
    with os.fdopen(fd, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, dest)
    return dest


# ---- the loop -------------------------------------------------------------------------------------------------------------
def run_heal_loop(ctx: PackageCtx, gate_fn: GateFn, repairer: Repairer, max_cycles: int = MAX_REPAIR_CYCLES, *,
                  fallback_gate_fn: FallbackGateFn | None = None, sleep: Callable[[float], None] = time.sleep,
                  clock: Callable[[], float] = time.monotonic, backoff=INFRA_BACKOFF_SECONDS,
                  probes: dict[str, Callable[[], bool]] | None = None, workspace: Path | None = None,
                  circuit_clock: Callable[[], float] = time.time) -> HealOutcome:
    probes = {**DEFAULT_PROBES, **(probes or {})}
    cycles: list[HealCycle] = []
    state = {"gate": gate_fn, "model": None}  # model: active approved fallback, if any
    circuits: dict[str, Circuit] = {}

    def circuit(dep: str) -> Circuit:
        return circuits.setdefault(dep, Circuit(dep, workspace=workspace, clock=circuit_clock))

    def call_gate(path: Path, call: Callable[[], EvalRecord], expect_sha: str) -> EvalRecord:
        try:
            rec = call()
        except EvaluationError as e:
            rec = _error_record(ctx, path, e)
        if sha256_file(path) != expect_sha:
            raise RuntimeError(f"invariant violated: bytes of {path} changed during gate evaluation")
        return rec

    def cat_of(record: EvalRecord, sha: str) -> Category:
        cat = classify(record)
        if cat is Category.PASS and record.binding.content_sha256 != sha:
            return Category.STALE_EVALUATION  # a PASS for other bytes is not a PASS for these
        return cat

    def evaluate(path: Path) -> tuple[EvalRecord, Category]:
        """Gate the exact bytes, healing infrastructure failures without touching them."""
        sha = sha256_file(path)
        record = call_gate(path, lambda: state["gate"](ctx, path), sha)
        cat = cat_of(record, sha)
        tries: dict[Category, int] = {}
        while cat in INFRA_CATEGORIES:
            t0 = clock()
            dep = _dependency(record, cat)
            if cat in CIRCUIT_CATEGORIES:
                circuit(dep).record_failure(cat)
            n = tries.get(cat, 0)
            retry_ok = n < RETRY_LIMITS.get(cat, 0)
            probe = PROBE_FOR_DEP.get(dep)
            probe_note = ""
            if probe and cat in (Category.GATEWAY_FAILURE, Category.MODEL_UNAVAILABLE, Category.DEPENDENCY_FAILURE):
                probe_note = f" probe {probe}={'ok' if run_probe(probe, probes) else 'fail'}"
            if retry_ok and circuit(dep).allow():
                delay = backoff[min(n, len(backoff) - 1)] if cat in (Category.MODEL_TIMEOUT, Category.GATEWAY_FAILURE) else 0
                if delay:
                    sleep(delay)
                tries[cat] = n + 1
                new = call_gate(path, lambda: state["gate"](ctx, path), sha)
                desc = f"retry same bytes after {delay}s backoff{probe_note}"
                model = state["model"]
            else:
                key = _model_key(record, state["model"], dep)
                fbs = APPROVED_FALLBACKS.get(key, ()) if (cat in MODEL_CATEGORIES and key) else ()
                fb = next((m for m in fbs if _fallback_dep(m) != dep and circuit(_fallback_dep(m)).allow()), None) if fallback_gate_fn else None
                if fb is None:
                    return record, cat  # exhausted: caller quarantines (infra, retryable)
                new = call_gate(path, lambda: fallback_gate_fn(ctx, path, fb), sha)  # type: ignore[misc]
                desc = f"fallback:{fb}{probe_note}"
                model = fb
                if cat_of(new, sha) not in INFRA_CATEGORIES:
                    state["gate"] = lambda c, p, _fb=fb: fallback_gate_fn(c, p, _fb)  # type: ignore[misc]
                    state["model"] = fb
                else:
                    cycles.append(HealCycle(len(cycles) + 1, sha, cat, "infra", list(record.reasons), desc, model, sha,
                                            Result(_val(new.result)), clock() - t0))
                    return new, cat_of(new, sha)
            new_cat = cat_of(new, sha)
            if new_cat not in INFRA_CATEGORIES:
                circuit(dep).record_success()
            cycles.append(HealCycle(len(cycles) + 1, sha, cat, "infra", list(record.reasons), desc, model, sha,
                                    Result(_val(new.result)), clock() - t0))
            record, cat = new, new_cat
        return record, cat

    def quarantine(category: Category, kind: str, record: EvalRecord, path: Path, reason: str, last: Category) -> HealOutcome:
        write_quarantine(ctx, category, kind, record, cycles, path, reason, last)
        result = Result.ERROR if kind == "infra" else Result.FAIL
        return HealOutcome(result, category, record, cycles, path, True)

    path = ctx.final_path
    base_path = path
    record, cat = evaluate(path)
    base_record, last_path, last_record = record, path, record
    content_cycles = 0
    while True:
        if cat is Category.PASS:
            return HealOutcome(Result.PASS, Category.PASS, record, cycles, path, False)
        if cat in INFRA_CATEGORIES:
            return quarantine(cat, "infra", record, path, f"infrastructure recovery exhausted ({cat.value})", cat)
        if cat not in CONTENT_CATEGORIES or cat is Category.MISSING_SOURCE:
            return quarantine(Category.NEEDS_REVIEW, "content", record, path, f"cannot ground a repair ({cat.value})", cat)
        if content_cycles >= max_cycles:
            return quarantine(Category.NEEDS_REVIEW, "content", last_record, last_path, f"still failing after {max_cycles} repair cycles", cat)
        t0 = clock()
        index = len(cycles) + 1
        in_sha = sha256_file(base_path)
        new_path = repairer(ctx, base_path, base_record, index)
        desc = getattr(repairer, "last_description", None) or f"{getattr(repairer, 'name', type(repairer).__name__)}"
        if new_path is None:
            return quarantine(Category.NEEDS_REVIEW, "content", base_record, base_path, f"repairer could not establish support: {desc}", cat)
        new_path = Path(new_path)
        out_sha = sha256_file(new_path)
        if out_sha == in_sha:
            return quarantine(Category.NEEDS_REVIEW, "content", base_record, base_path, "repair produced identical bytes", cat)
        content_cycles += 1
        cyc = HealCycle(index, in_sha, cat, "content", list(base_record.reasons), desc, None, out_sha, Result.ERROR, 0.0)
        cycles.append(cyc)  # reserved first so infra cycles spent evaluating the new bytes follow it in order
        new_record, new_cat = evaluate(new_path)
        cyc.result = Result(_val(new_record.result))
        cyc.elapsed_s = clock() - t0
        last_path, last_record = new_path, new_record
        if is_worse(base_record, new_record):
            log.warning("repair %d made %s worse; reverting base to the previous candidate", index, ctx.slug)
            record, cat = base_record, cat_of(base_record, in_sha)
            path = base_path
            cyc.repair += " [WORSE: reverted]"
            continue
        path, base_path, base_record, record, cat = new_path, new_path, new_record, new_record, new_cat
