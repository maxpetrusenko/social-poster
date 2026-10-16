"""Learn from detector reports: ingest the sentences GPTZero or Winston flagged (and the ones they rated human) into a deduplicated JSONL corpus.

    python -m scripts.fingerprint_eval.detector_corpus ingest --detector gptzero|winston --file paste.txt|report.json [--article-sha SHA]

Advisory data only: patterns.corpus_echo counts n-gram overlap with flagged rows and the brief shows recent flagged rows as negative examples.
Nothing here is a gate or a score. Rows: {detector, label: flagged|human, sentence, article_sha?, ingested_at}.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_CORPUS = Path(__file__).resolve().parents[2] / "data" / "fingerprint-eval" / "detector-corpus.jsonl"
DETECTORS = ("gptzero", "winston")

# section headings -> label (None ends a section without collecting). Matched on the normalized line, with or without a trailing ":" or inline text.
HEADINGS = [
    (re.compile(r"^your most ai sentences\b[:\s]*(.*)$", re.I), "flagged"),
    (re.compile(r"^your most human sentences\b[:\s]*(.*)$", re.I), "human"),
    (re.compile(r"^(?:high|medium) ai impact\b[:\s-]*(.*)$", re.I), "flagged"),
    (re.compile(r"^low ai impact\b[:\s-]*(.*)$", re.I), None),
    (re.compile(r"^sections? driving (?:the )?ai score\b[:\s]*(.*)$", re.I), "flagged"),
    (re.compile(r"^(?:most human|human) (?:sections?|sentences)\b[:\s]*(.*)$", re.I), "human"),
]
STOP_RE = re.compile(r"^(?:overall|readability|human score|ai score|sentence impact|summary|report|gptzero|winston|your document|probability)\b", re.I)
BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
PCT_RE = re.compile(r"\s*[(\[]?\s*\d+(?:\.\d+)?\s*%\s*(?:ai|human|likely human|ai-generated|probability)?\s*[)\]]?\s*$", re.I)
PCT_LEAD_RE = re.compile(r"^\s*[(\[]?\s*\d+(?:\.\d+)?\s*%\s*(?:ai|human)?\s*[)\]]?\s*[:\-–]?\s*", re.I)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')).strip()


def _sentence(line: str) -> str | None:
    """A report line as a sentence: bullets, numbering, quotes and percent labels dropped; None when it is not a sentence (4+ words, ends in ./?/!)."""
    s = BULLET_RE.sub("", _norm(line))
    s = PCT_LEAD_RE.sub("", PCT_RE.sub("", s)).strip()
    if len(s) > 1 and s[0] == '"' and s.count('"') >= 2:
        s = s[1:s.rindex('"')] + s[s.rindex('"') + 1:]
    s = s.strip().strip('"').strip()
    return s if len(s.split()) >= 4 and s[-1] in ".?!" else None


def parse_paste(text: str) -> dict:
    """{flagged: [...], human: [...]} from a raw pasted GPTZero or Winston report."""
    out: dict = {"flagged": [], "human": []}
    mode = None
    for raw in text.splitlines():
        line = _norm(raw)
        if not line:
            continue
        for rx, label in HEADINGS:
            m = rx.match(line)
            if m:
                mode = label
                line = m.group(1).strip()
                break
        else:
            if STOP_RE.match(line):
                mode = None
                continue
        if mode and line:
            s = _sentence(line)
            if s:
                out[mode].append(s)
    return out


def parse_json(text: str) -> dict:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("JSON input must be an object {flagged: [], human: []}")
    return {k: [_norm(str(x)) for x in data.get(k, []) if str(x).strip()] for k in ("flagged", "human")}


def read_rows(corpus: Path) -> list[dict]:
    try:
        lines = corpus.read_text().splitlines()
    except OSError:
        return []
    rows = []
    for ln in lines:
        try:
            r = json.loads(ln)
        except ValueError:
            continue
        if isinstance(r, dict):
            rows.append(r)
    return rows


def ingest(detector: str, file: Path, article_sha: str | None = None, corpus: Path | None = None, now: str | None = None) -> dict:
    """Append the report's sentences to the corpus, skipping any (detector, label, sentence) already there. Returns {added, skipped, corpus}."""
    file = Path(file)
    text = file.read_text()
    parsed = parse_json(text) if file.suffix.lower() == ".json" else parse_paste(text)
    return _append(detector, parsed, article_sha, corpus, now)


def ingest_result(detector: str, result: dict, article_sha: str | None = None, corpus: Path | None = None, now: str | None = None) -> dict:
    """Ingest a detector adapter result dict (DetectorResult.to_dict()): its flagged_sentences become flagged rows. An errored result adds nothing."""
    parsed = {"flagged": [], "human": []} if result.get("error") else parse_json(json.dumps({"flagged": result.get("flagged_sentences") or []}))
    return _append(detector, parsed, article_sha or result.get("text_sha256"), corpus, now)


def _append(detector: str, parsed: dict, article_sha: str | None, corpus: Path | None, now: str | None) -> dict:
    if detector not in DETECTORS:
        raise ValueError(f"detector must be one of {', '.join(DETECTORS)}, got {detector!r}")
    corpus = Path(corpus or DEFAULT_CORPUS)
    seen = {(r.get("detector"), r.get("label"), _norm(str(r.get("sentence", "")))) for r in read_rows(corpus)}
    stamp = now or datetime.now(timezone.utc).isoformat(timespec="seconds")
    new, skipped = [], 0
    for label in ("flagged", "human"):
        for s in parsed[label]:
            key = (detector, label, s)
            if key in seen:
                skipped += 1
                continue
            seen.add(key)
            row = {"detector": detector, "label": label, "sentence": s}
            if article_sha:
                row["article_sha"] = article_sha
            row["ingested_at"] = stamp
            new.append(row)
    if new:
        corpus.parent.mkdir(parents=True, exist_ok=True)
        with corpus.open("a") as fh:
            fh.writelines(json.dumps(r, sort_keys=True) + "\n" for r in new)
    return {"added": len(new), "skipped": skipped, "corpus": str(corpus)}


def recent_flagged(limit: int = 5, corpus: Path | None = None) -> list[str]:
    """The newest flagged sentences (by ingested_at, later rows first within a batch), distinct."""
    rows = [(r.get("ingested_at", ""), i, r["sentence"]) for i, r in enumerate(read_rows(Path(corpus or DEFAULT_CORPUS)))
            if r.get("label") == "flagged" and r.get("sentence")]
    out: list[str] = []
    for _, _, s in sorted(rows, key=lambda x: (x[0], x[1]), reverse=True):
        if s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.fingerprint_eval.detector_corpus")
    sub = ap.add_subparsers(dest="cmd", required=True)
    ing = sub.add_parser("ingest")
    ing.add_argument("--detector", required=True, choices=DETECTORS)
    ing.add_argument("--file", required=True, type=Path)
    ing.add_argument("--article-sha")
    ing.add_argument("--corpus", type=Path)
    a = ap.parse_args(argv)
    try:
        res = ingest(a.detector, a.file, a.article_sha, a.corpus)
    except (OSError, ValueError) as exc:
        print(f"ingest failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
