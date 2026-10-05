"""python -m scripts.publish_route decide|repair|verify --package P [--article F] [--queue-item F] [--json]

decide  reads both checks, writes evals/publish-route/route.json, never edits the article.
repair  decide plus the bounded AUTO_REPAIR loop (max 2 cycles; every content change reruns release authorize, then the review).
verify  exit 0 only if route.json still matches the current bytes, integrity record id and MEDIUM_REVIEW policy version.
Exit: 0 DIRECT_PUBLISH, 10 PUBLICATION_ROUTE, 20 AUTO_REPAIR pending, 3 QUARANTINE, 2 usage/resolution error.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import orchestrate as OR
from . import publications as PUB

EXIT = {"A": 0, "B": 10, "C": 20, "D": 3}


def main(argv: list[str] | None = None, runner=OR.default_runner) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.publish_route", description=__doc__)
    ap.add_argument("command", choices=("decide", "repair", "verify"))
    ap.add_argument("--package", required=True, type=Path)
    ap.add_argument("--article", type=Path)
    ap.add_argument("--queue-item", type=Path, help="JSON with channel / source_name for the exact-match title suffix repair")
    ap.add_argument("--publications", type=Path, default=PUB.DEFAULT_PATH)
    ap.add_argument("--max-cycles", type=int, default=OR.MAX_ROUTE_CYCLES)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    if a.command == "verify":
        ok, why = OR.verify_route(a.package, a.article)
        print(("VALID: " if ok else "INVALID: ") + why)
        return 0 if ok else 1
    qi = None
    if a.queue_item:
        try:
            qi = json.loads(a.queue_item.read_text())
        except (OSError, ValueError) as e:
            print(f"ERROR: queue item unreadable: {e}", file=sys.stderr)
            return 2
    try:
        rec = OR.run_route(a.package, a.article, runner=runner, repair=a.command == "repair", max_cycles=a.max_cycles,
                           queue_item=qi, publications_path=a.publications)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps(rec, indent=2, ensure_ascii=False))
    else:
        print(f"{rec['route_code']} {rec['detail']}\n" + "\n".join(f"- {r}" for r in rec["reasons"]) +
              (f"\ncandidates: {', '.join(c['name'] for c in rec['publication_candidates'])}" if rec["publication_candidates"] else "") +
              (f"\ntopics to research: {', '.join(rec['topics'])}" if rec["detail"] == "B_NEEDS_PUBLICATION_RESEARCH" else "") +
              f"\n{a.package / OR.ROUTE_REL}")
    return EXIT[rec["route_code"]]


if __name__ == "__main__":
    sys.exit(main())
