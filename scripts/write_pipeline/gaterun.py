"""python -m scripts.write_pipeline.gaterun: the evaluator's `run --gate` with the source notes bound in.

`scripts.fingerprint_eval.run --gate` has no --source-notes flag, so a sentence that is supported only by the evidence ledger or the
source notes would be judged against its reference section alone. This wrapper calls the same `run_gate` (same judge, extractor, threshold,
exit codes and gate.json) and passes the notes, so the existing added-claim support check sees the ledger and the sources. It adds no
judgement of its own.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def main(argv=None) -> int:
    from scripts.fingerprint_eval.run import load_gateway_key
    from scripts.fingerprint_eval.gate import run_gate
    from scripts.fingerprint_eval.rewrite import EXTRACTOR
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gate", action="store_true")
    ap.add_argument("--article", required=True, type=Path)
    ap.add_argument("--draft", required=True, type=Path)
    ap.add_argument("--author-corpus", required=True, type=Path)
    ap.add_argument("--pipeline-corpus", type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--source-notes", type=Path)
    ap.add_argument("--gate-threshold", type=float, default=0.90)
    ap.add_argument("--extractor", default=os.environ.get("FG_EXTRACTOR", EXTRACTOR))
    ap.add_argument("--judge", default=os.environ.get("FG_JUDGE", "claude:sonnet"))
    a = ap.parse_args(argv)
    from scripts.fingerprint_eval.textutil import resolve_pipeline_corpus
    load_gateway_key()
    return run_gate(a.article, a.draft, a.author_corpus, a.pipeline_corpus or resolve_pipeline_corpus(), a.out, a.judge, a.gate_threshold, a.extractor,
                    source_notes=a.source_notes)


if __name__ == "__main__":
    sys.exit(main())
