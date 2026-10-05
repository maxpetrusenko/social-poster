"""CLI: python -m scripts.fingerprint_eval.release authorize|verify|status --package P

authorize never publishes anything: it resolves the final candidate, runs the heal loop (or a single gate run when heal is
not importable yet), and on PASS writes the release files + authorization + workspace ACTIVE marker + ledger event.
verify is what Medium mutation guards call: exit 0 only for an authorization bound to the exact current bytes,
evaluator and author corpus.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import sys
import time
from pathlib import Path

from . import authz, ledger, record as R
from .contracts import (EXIT_INFRA_QUARANTINED, EXIT_QUARANTINED, INFRA_CATEGORIES, MAX_REPAIR_CYCLES, QUARANTINE, clamp_cycles, RELEASE_ACTIVE, RELEASE_ARTICLE,
                        Authorization, Binding, Category, HealOutcome, LedgerState, PackageCtx, Result)

REPO = authz.REPO


def workspace_root() -> Path:
    return Path(os.environ.get("FINGERPRINT_EVAL_WORKSPACE") or REPO / "data" / "article-workspace")


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# ---- verify ------------------------------------------------------------------------------------------------------
def verify_package(package: Path) -> tuple[bool, str]:
    ok, why, _ = verify_package_detail(package)
    return ok, why


def verify_package_detail(package: Path) -> tuple[bool, str, str | None]:
    """(valid, reason, verified content sha256). The hash is computed from the exact bytes that were checked,
    so a caller comparing against it never re-derives it from a file that could change after verification."""
    ok, why, sha = _verify(package)
    return ok, why, sha if ok else None


def _verify(package: Path) -> tuple[bool, str, str | None]:
    try:
        ctx = authz.resolve_package(package)
        final = ctx.final_path.read_bytes()
        ev = authz.evaluator_version()
        if ev.dirty:
            return False, "evaluator tree has uncommitted changes (dirty): release blocked", None
        current = authz.make_binding(ctx, _sha(final), ev)
        rel = (ctx.package / RELEASE_ARTICLE).read_bytes()
    except FileNotFoundError as e:
        return False, f"missing release artifact: {e.filename}", None
    except (authz.PackageError, authz.EnvError, OSError) as e:
        return False, f"cannot establish current state: {e}", None
    if rel != final:
        return False, "release article bytes differ from the current final bytes", None
    try:
        auth = R.load_authorization(ctx.package)  # signature checked
        rec = R.load_record_in(ctx.package, auth.record_path)  # contained in <package>/evals/fingerprint-gate/runs/, signature checked
        R.check_raw_report(ctx.package, rec)  # raw gate report exists, contained, sha256 == the signed field
    except (R.RecordError, OSError) as e:
        return False, str(e), None
    if rec.result is not Result.PASS:
        return False, f"authorization record is {rec.result.value}, not PASS", None
    if auth.release_article_sha256 != current.content_sha256:
        return False, "authorization is for different release bytes", None
    if auth.binding != current or rec.binding != current:
        diffs = [f.name for f in dataclasses.fields(Binding) if getattr(auth.binding, f.name) != getattr(current, f.name) or getattr(rec.binding, f.name) != getattr(current, f.name)]
        return False, "authorization binding differs from current: " + ", ".join(diffs), None
    return True, "authorized", current.content_sha256


# ---- authorize ---------------------------------------------------------------------------------------------------
def _load_heal():
    """(run_heal_loop, repairer) or None when heal/repair are not importable yet."""
    try:
        from . import heal
        run = heal.run_heal_loop
    except Exception:  # noqa: BLE001  heal is owned by another workstream
        return None
    repairer = None
    if callable(getattr(heal, "get_repairer", None)):  # pinned contract: heal owns repairer selection
        return run, heal.get_repairer()
    try:
        from . import repair
        for name in ("repair", "default_repairer", "repair_candidate"):
            if callable(getattr(repair, name, None)):
                repairer = getattr(repair, name)
                break
    except Exception:  # noqa: BLE001
        pass
    return run, repairer or (lambda ctx, cand, rec, cycle: None)


def _single_run(ctx: PackageCtx, gate_fn) -> HealOutcome:
    """Fallback: one gate run, never repairs, quarantines on FAIL/ERROR."""
    rec = gate_fn(ctx, ctx.final_path)
    ok = rec.result is Result.PASS
    return HealOutcome(rec.result, Category.PASS if ok else rec.category, rec, [], ctx.final_path, not ok)


def _write_quarantine(ctx: PackageCtx, outcome: HealOutcome, evaluator_id: str) -> int:
    cat = outcome.category if outcome.category is not Category.PASS else Category.UNKNOWN_ERROR
    rec = outcome.record
    if cat is Category.NEEDS_REVIEW and rec is not None and rec.category is Category.MISSING_SOURCE:
        cat = Category.MISSING_SOURCE  # the terminal cause is more useful than the generic review bucket
    infra = cat in INFRA_CATEGORIES
    content = rec.binding.content_sha256 if rec else _sha(outcome.final_path.read_bytes())
    arts = []
    if rec:
        p = R.find_record_path(ctx.package, rec)
        if p:
            arts.append(str(p.relative_to(ctx.package)))
        if rec.raw_report_path:
            arts.append(rec.raw_report_path)
    q = {"status": "NEEDS_REVIEW", "category": cat.value, "kind": "infra" if infra else "content", "retryable": infra, "created_at_utc": R.now_utc(),
         "content_sha256": content, "evaluator_id": evaluator_id, "cycles": R.jsonable(outcome.cycles), "artifacts": arts}
    R.atomic_write(ctx.package / QUARANTINE, (json.dumps(q, indent=1, sort_keys=True) + "\n").encode())
    ledger.append(ctx.package, LedgerState.QUARANTINED, content, evaluator_id, {"category": cat.value, "kind": q["kind"]})
    ledger.append(ctx.package, LedgerState.PUBLISH_BLOCKED, content, evaluator_id, {"reason": cat.value})
    if rec:
        R.write_summary(ctx.package, rec, outcome.cycles, status=None if infra else "NEEDS_REVIEW")
    return EXIT_INFRA_QUARANTINED if infra else EXIT_QUARANTINED


def _ensure_final_points_at(ctx: PackageCtx, final_path: Path) -> None:
    """After a heal, the resolver must pick the healed bytes (finalFile -> article-healed-N.md). No-op if it already does."""
    if authz.resolve_package(ctx.package).final_path.resolve() == final_path.resolve():
        return
    vj = ctx.package / "version.json"
    d = json.loads(vj.read_text()) if vj.exists() else {}
    d["finalFile"] = str(final_path.resolve().relative_to(ctx.package.resolve()))
    R.atomic_write(vj, (json.dumps(d, indent=2, ensure_ascii=False) + "\n").encode())


def authorize(package: Path, max_repairs: int = MAX_REPAIR_CYCLES, dry_run: bool = False, out=print) -> int:
    package = Path(package)
    try:
        max_repairs = clamp_cycles(max_repairs)
    except ValueError as e:
        out(f"authorize: {e}")
        return 2
    try:
        ctx = authz.resolve_package(package)
    except authz.PackageError as e:
        out(f"authorize: cannot resolve package: {e}")
        if not package.is_dir():
            return 2
        zero = "0" * 64
        q = {"status": "NEEDS_REVIEW", "category": Category.MISSING_SOURCE.value, "kind": "content", "retryable": False, "created_at_utc": R.now_utc(),
             "content_sha256": zero, "evaluator_id": "unknown", "cycles": [], "artifacts": []}
        if not dry_run:
            R.atomic_write(package / QUARANTINE, (json.dumps(q, indent=1, sort_keys=True) + "\n").encode())
        return EXIT_QUARANTINED
    try:
        ev = authz.evaluator_version()
    except authz.EnvError as e:
        out(f"authorize: blocked, {Category.DEPENDENCY_FAILURE.value}: {e}")
        return EXIT_INFRA_QUARANTINED
    if ev.dirty:
        out(f"authorize: blocked, {Category.DEPENDENCY_FAILURE.value}: evaluator tree is dirty ({ev.id})")
        if not dry_run:
            content = _sha(ctx.final_path.read_bytes())
            ledger.append(ctx.package, LedgerState.PUBLISH_BLOCKED, content, ev.id, {"reason": Category.DEPENDENCY_FAILURE.value, "detail": "dirty evaluator"})
            q = {"status": "NEEDS_REVIEW", "category": Category.DEPENDENCY_FAILURE.value, "kind": "infra", "retryable": True, "created_at_utc": R.now_utc(),
                 "content_sha256": content, "evaluator_id": ev.id, "cycles": [], "artifacts": []}
            R.atomic_write(ctx.package / QUARANTINE, (json.dumps(q, indent=1, sort_keys=True) + "\n").encode())
        return EXIT_INFRA_QUARANTINED
    healer = None if dry_run else _load_heal()
    if healer is None:
        outcome = _single_run(ctx, authz.evaluate_package)
    else:
        run, repairer = healer
        outcome = run(ctx, authz.evaluate_package, repairer, max_repairs)
    for cy in outcome.cycles:
        ledger.append(ctx.package, LedgerState.HEAL_CYCLE, cy.input_sha256, ev.id, R.jsonable(cy))
    rec = outcome.record
    if rec is not None:
        out(R.render_summary(rec, outcome.cycles).rstrip())
    if outcome.final_result is not Result.PASS or rec is None or rec.result is not Result.PASS:
        if dry_run:
            out("authorize (dry run): not authorized")
            return EXIT_INFRA_QUARANTINED if outcome.category in INFRA_CATEGORIES else EXIT_QUARANTINED
        if rec is None:
            rec_cat = Category.UNKNOWN_ERROR
            outcome = HealOutcome(Result.ERROR, rec_cat, None, outcome.cycles, outcome.final_path, True)
        return _write_quarantine(ctx, outcome, ev.id)
    # PASS: trust nothing the heal layer reports without re-checking the bytes it names
    final = outcome.final_path.read_bytes()
    if _sha(final) != rec.binding.content_sha256:
        out("authorize: heal outcome names bytes that differ from the PASS record; refusing")
        return _write_quarantine(ctx, HealOutcome(Result.ERROR, Category.STALE_EVALUATION, rec, outcome.cycles, outcome.final_path, True), ev.id)
    if dry_run:
        out("authorize (dry run): PASS, nothing written")
        return 0
    rec_path = R.find_record_path(ctx.package, rec)
    if rec_path is None:
        return _write_quarantine(ctx, HealOutcome(Result.ERROR, Category.UNKNOWN_ERROR, rec, outcome.cycles, outcome.final_path, True), ev.id)
    _ensure_final_points_at(ctx, outcome.final_path)
    R.atomic_write(ctx.package / RELEASE_ARTICLE, final)
    auth = Authorization(binding=rec.binding, record_path=str(rec_path.relative_to(ctx.package)), authorized_at_utc=R.now_utc(),
                         release_article_sha256=_sha((ctx.package / RELEASE_ARTICLE).read_bytes()))
    R.write_authorization(ctx.package, auth)
    active = {"package": str(ctx.package.resolve()), "slug": ctx.slug, "content_sha256": rec.binding.content_sha256, "activated_at_utc": R.now_utc()}
    R.atomic_write(workspace_root() / RELEASE_ACTIVE, (json.dumps(active, indent=1, sort_keys=True) + "\n").encode())
    R.write_summary(ctx.package, rec, outcome.cycles)
    ledger.append(ctx.package, LedgerState.PUBLISH_AUTHORIZED, rec.binding.content_sha256, rec.binding.evaluator_id,
                  {"record": auth.record_path, "release": str(RELEASE_ARTICLE)})
    ok, why = verify_package(ctx.package)  # the written files must themselves verify
    if not ok:
        out(f"authorize: self-verification failed: {why}")
        return EXIT_INFRA_QUARANTINED
    return 0


# ---- status ------------------------------------------------------------------------------------------------------
def status(package: Path) -> dict:
    ctx = authz.resolve_package(package)
    try:
        ev = authz.evaluator_version()
        current, dirty, err = authz.make_binding(ctx, _sha(ctx.final_path.read_bytes()), ev), ev.dirty, None
    except (authz.EnvError, OSError) as e:
        current, dirty, err = None, False, str(e)
    st = ledger.reconstruct(ctx, current, dirty)
    summary = None
    if st.record_path:
        try:
            summary = R.render_summary(R.load_record_in(ctx.package, st.record_path))
        except R.RecordError:
            pass
    d = {"package": str(ctx.package), "slug": ctx.slug, "final_path": str(ctx.final_path), "final_rule": ctx.final_rule,
         "states": {"requested": st.requested, "executed": st.executed, "valid": st.valid, "matches_content": st.matches_content, "authorized": st.authorized},
         "content_sha256": st.content_sha256, "record": st.record_path, "record_result": st.record_result, "reasons": st.reasons,
         "evaluator_dirty": dirty, "quarantined": (ctx.package / QUARANTINE).exists(), "summary": summary}
    if err:
        d["error"] = err
    return d


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.fingerprint_eval.release")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("authorize")
    a.add_argument("--package", required=True, type=Path)
    a.add_argument("--max-repairs", type=int, default=MAX_REPAIR_CYCLES)
    a.add_argument("--dry-run", action="store_true")
    v = sub.add_parser("verify")
    v.add_argument("--package", required=True, type=Path)
    v.add_argument("--json", action="store_true")
    s = sub.add_parser("status")
    s.add_argument("--package", required=True, type=Path)
    s.add_argument("--json", action="store_true")
    n = ap.parse_args(argv)
    if n.cmd == "authorize":
        return authorize(n.package, n.max_repairs, n.dry_run)
    if n.cmd == "verify":
        ok, why, sha = verify_package_detail(n.package)
        if n.json:  # release bytes == final bytes when valid, so both hashes are the verified content hash
            print(json.dumps({"valid": ok, "reason": why, "content_sha256": sha, "release_article_sha256": sha}))
        else:
            print(("VERIFIED: " if ok else "NOT AUTHORIZED: ") + why)
        return 0 if ok else 1
    try:
        d = status(n.package)
    except authz.PackageError as e:
        print(f"status: {e}")
        return 2
    if n.json:
        print(json.dumps(d, indent=1))
    else:
        for k, val in d["states"].items():
            print(f"{k}: {'yes' if val else 'no'}")
        for r in d["reasons"]:
            print(f"  - {r}")
        if d["summary"]:
            print("\n" + d["summary"].rstrip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
