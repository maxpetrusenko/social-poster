"""dryrun-evidence.json and SUMMARY.md writers."""
from __future__ import annotations

import json
from pathlib import Path


def write(out: Path, doc: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "dryrun-evidence.json").write_text(json.dumps(doc, indent=2, sort_keys=True, default=str) + "\n")
    (out / "SUMMARY.md").write_text(summary(doc))


def _cell(v) -> str:
    return str(v).replace("|", "\\|").replace("\n", " ")


def _diff(expected: list[dict], actual: dict) -> str:
    """Keys of the closest expected outcome that differ from actual."""
    best = min(expected, key=lambda e: sum(e.get(k) != actual.get(k) for k in set(e) | set(actual)))
    return "; ".join(f"{k}: expected {best.get(k)!r}, got {actual.get(k)!r}" for k in sorted(set(best) | set(actual)) if best.get(k) != actual.get(k))


def summary(doc: dict) -> str:
    cs = doc["cases"]
    failed = [c for c in cs if not c["passed"]]
    lines = [f"# Fingerprint gate dry run ({doc['mode']})", "",
             f"- result: **{'FAIL' if failed or not doc['source_untouched'] else 'PASS'}** ({len(cs) - len(failed)}/{len(cs)} cases)",
             f"- source package: `{doc['source_package']}` (untouched: {doc['source_untouched']})",
             f"- evaluator id: `{doc['evaluator_id']}`", f"- author corpus sha256: `{doc['author_corpus_sha256']}`",
             f"- guard: `{doc['guard']['file']}` sha256 `{doc['guard']['sha256']}`", f"- generated: {doc['generated_utc']}", "",
             "| # | case | expected | actual | result | exit codes | hashes (in -> out) |", "|---|---|---|---|---|---|---|"]
    for i, c in enumerate(cs, 1):
        exp = " OR ".join(json.dumps(e, sort_keys=True) for e in c["expected"])
        h = c["hashes"]
        flow = f"{(h.get('input') or h.get('source_final') or h.get('final_before') or '')[:10]} -> {(h.get('authorized') or h.get('second_authorized') or h.get('final_after') or '-')[:10]}"
        lines.append(f"| {i} | {c['name']} | {_cell(exp)} | {_cell(json.dumps(c['actual'], sort_keys=True))} | {'PASS' if c['passed'] else 'FAIL'} | "
                     f"{_cell(json.dumps(c['exit_codes']))} | {flow} |")
    if failed:
        lines += ["", "## Failures", ""] + [f"- {c['name']}: {c.get('error') or _diff(c['expected'], c['actual'])}" for c in failed]
    lines += ["", "Per-case ledger states, heal cycles, guard decisions and artifact paths are in `dryrun-evidence.json`.", ""]
    return "\n".join(lines)
