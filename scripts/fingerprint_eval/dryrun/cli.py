"""CLI: python -m scripts.fingerprint_eval.dryrun --source-package P --sandbox D --out E [--guard G] [--offline-models] [--only NAME ...]"""
from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from . import evidence
from . import sandbox as S
from .cases import CASES
from .context import Ctx
from .guardrig import DEFAULT_GUARD, clipboard_available, clipboard_restored


def run_case(name, desc, fn, args) -> dict:
    t0 = time.time()
    c = Ctx(name, *args)
    expected, actual, error = [{}], {}, None
    try:
        expected, actual = fn(c)
    except Exception as e:  # noqa: BLE001  one broken case must not hide the others
        error = f"{type(e).__name__}: {e}"
        traceback.print_exc()
    passed = error is None and actual in expected
    pkgs = c.ev.pop("packages", None)
    if pkgs is None:  # snapshot every package dir of the case
        for p in sorted((c.ws / "articles").glob("*")):
            c.snapshot(p, p.name)
        pkgs = c.ev.pop("packages", {})
    first = next(iter(pkgs.values()), {})
    return {"name": name, "description": desc, "expected": expected, "actual": actual, "passed": passed, "error": error,
            "exit_codes": c.ev["exit_codes"], "hashes": c.ev["hashes"], "notes": c.ev["notes"], "packages": pkgs,
            "evaluator_id": first.get("evaluator_id"), "author_corpus_sha256": first.get("author_corpus_sha256"),
            "guard_decisions": c.rig.decisions, "sandbox": str(c.ws), "elapsed_s": round(time.time() - t0, 1)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.fingerprint_eval.dryrun", description=__doc__)
    ap.add_argument("--source-package", required=True, type=Path, help="real article package; only ever read")
    ap.add_argument("--sandbox", required=True, type=Path, help="scratch dir; every case gets a fresh subdirectory")
    ap.add_argument("--out", required=True, type=Path, help="evidence dir (dryrun-evidence.json, SUMMARY.md, guard-decisions.jsonl)")
    ap.add_argument("--guard", type=Path, default=None, help="guard file to test (default: the repo's scripts/hermes/medium_publish_guard.py)")
    ap.add_argument("--offline-models", action="store_true", help="use the e2e fakes instead of claude -p + the gateway")
    ap.add_argument("--only", nargs="*", default=None, help="run only these case names")
    n = ap.parse_args(argv)

    src, guard = n.source_package.resolve(), (n.guard or DEFAULT_GUARD).resolve()
    sandbox_root, out = n.sandbox.resolve(), n.out.resolve()
    if not (src / "version.json").exists():
        print(f"dryrun: {src} has no version.json", file=sys.stderr)
        return 2
    if not guard.is_file():
        print(f"dryrun: guard {guard} not found", file=sys.stderr)
        return 2
    if not clipboard_available():
        print("dryrun: pbcopy/pbpaste required (the installed guard reads the real clipboard)", file=sys.stderr)
        return 2
    for d in (sandbox_root, out):
        if d == src or src in d.parents or d in src.parents:
            print(f"dryrun: {d} overlaps the source package; refusing", file=sys.stderr)
            return 2
    if sandbox_root.exists() and any(sandbox_root.iterdir()):
        print(f"dryrun: sandbox {sandbox_root} is not empty", file=sys.stderr)
        return 2
    sandbox_root.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    log = out / "guard-decisions.jsonl"

    before = S.tree_digest(src)
    names = set(n.only) if n.only else None
    results = []
    with clipboard_restored():
        for name, desc, fn in CASES:
            if names is not None and name not in names:
                continue
            print(f"== {name}: {desc}", flush=True)
            r = run_case(name, desc, fn, (src, sandbox_root, n.offline_models, guard, log))
            print(f"   {'PASS' if r['passed'] else 'FAIL'} {r['error'] or ''}", flush=True)
            results.append(r)
    after = S.tree_digest(src)

    from scripts.fingerprint_eval import authz
    ev = authz.evaluator_version()
    doc = {"generated_utc": datetime.now(timezone.utc).isoformat(), "mode": "offline-models (e2e fakes)" if n.offline_models else "real models",
           "source_package": str(src), "source_digest_before": before, "source_digest_after": after, "source_untouched": before == after,
           "evaluator_id": ev.id, "evaluator_dirty": ev.dirty, "author_corpus_sha256": authz.corpus_sha256(),
           "guard": {"file": str(guard), "sha256": S.sha(guard.read_bytes())}, "cases": results}
    evidence.write(out, doc)
    print(f"evidence: {out / 'dryrun-evidence.json'}\nsummary:  {out / 'SUMMARY.md'}")
    bad = [r["name"] for r in results if not r["passed"]]
    if before != after:
        print("dryrun: SOURCE PACKAGE CHANGED", file=sys.stderr)
    if bad:
        print("dryrun: FAILED cases: " + ", ".join(bad), file=sys.stderr)
    return 1 if bad or before != after else 0


if __name__ == "__main__":
    sys.exit(main())
