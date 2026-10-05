"""python -m scripts.medium_review review|autofix|propose --package P [--article F] [--json]

Exit 0 = reviewed (advisory; never blocks publish), 2 = ERROR. The release controller decides what to do with it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import autofix as AF
from . import editorial as ED
from . import policy as POL
from . import review as RV
from . import scorecard as SC
from .package import resolve, sha256_file

EXIT_OK, EXIT_ERROR = 0, 2


def _load_record(ctx, force=False, llm=None) -> dict:
    p = ctx.out_dir / "MEDIUM_REVIEW.json"
    try:
        rec = json.loads(p.read_text())
        if rec.get("status") == "REVIEWED" and rec["binding"]["content_sha256"] == sha256_file(ctx.article_path):
            return rec
    except (OSError, ValueError, KeyError):
        pass
    return RV.run_review(ctx, force=force, llm=llm)


def _print(obj, as_json: bool, human: str) -> None:
    print(json.dumps(obj, indent=2) if as_json else human)


def main(argv: list[str] | None = None, llm=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.medium_review", description=__doc__)
    ap.add_argument("command", choices=("review", "autofix", "propose"))
    ap.add_argument("--package", required=True, type=Path)
    ap.add_argument("--article", type=Path)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--force", action="store_true", help="review: ignore the cache; propose: propose even if nothing is weak")
    a = ap.parse_args(argv)
    try:
        ctx = resolve(a.package, a.article)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return EXIT_ERROR
    if a.command == "review":
        rec = RV.run_review(ctx, force=a.force, llm=llm)
        ok = rec["status"] == "REVIEWED"
        if ok:
            s = rec["scorecard"]
            human = (f"REVIEWED{' (cache hit)' if rec.get('cache_hit') else ''}  boost_candidate={s['boost_candidate']}  "
                     f"risk={s['general_distribution_risk']}  weakest={s['weakest_dimension']}  "
                     f"author_input_required={rec['author_input_required']['required']}\n{rec['disclaimer']}\n"
                     f"{ctx.out_dir / 'MEDIUM_REVIEW.json'}")
        else:
            human = f"ERROR: {rec.get('error')}"
        _print(rec, a.json, human)
        return EXIT_OK if ok else EXIT_ERROR
    if a.command == "autofix":
        fixes = AF.apply_fixes(ctx)
        _print({"fixes": fixes, "requires_integrity_gate": bool(fixes)}, a.json,
               "\n".join(f"{x['kind']}: {x['path']}" for x in fixes) or "no safe fixes applicable")
        return EXIT_OK
    rec = _load_record(ctx, llm=llm)
    if rec["status"] != "REVIEWED":
        _print(rec, a.json, f"ERROR: {rec.get('error')}")
        return EXIT_ERROR
    res = ED.propose(ctx, rec, llm or RV.default_llm, POL.REPO, force=a.force)
    _print(res, a.json, f"{res['status']} flag={res['flag']} candidate={res['candidate_path']} (requires integrity gate)")
    return EXIT_ERROR if res["status"] == "ERROR" else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
