"""One-off: extract claims for the held-out article with the production extractor (claude:sonnet, no coverage retry).
Extraction is not the object under test; the output is frozen in extraction.json before any judge call."""
from __future__ import annotations

import json
from pathlib import Path

from ...rewrite import extract_propositions, is_meta_claim, segment_article

H = Path(__file__).parent


def main() -> None:
    segs = segment_article((H / "article.md").read_text())
    out = {}
    for s in segs:
        if s.frozen:
            continue
        extract_propositions(s, "claude:sonnet")
        out[str(s.idx)] = {"propositions": [p for p in s.propositions if not is_meta_claim(p["claim"])]}
        print("=== SEG", s.idx, s.section, "claims", len(out[str(s.idx)]["propositions"]))
        print(s.text)
        for i, p in enumerate(out[str(s.idx)]["propositions"], 1):
            print("  ", i, p["claim"])
    (H / "extraction.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
