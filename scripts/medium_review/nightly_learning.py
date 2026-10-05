"""Nightly learning inputs (importable; the nightly job is NOT edited here).

row_from_package(pkg)      one learning row per published package (schema: data/medium-policy/learning-row.schema.json)
build_rows(workspace)      rows for every published package that has a review scorecard
correlation_table(rows)    PURE function: bucketed counts and means with n. Correlation, not causation.
"""
from __future__ import annotations

import json
from pathlib import Path

from .package import boost_observed, read_json

WORDING = ("Correlation, not causation. Buckets show what co-occurred in a small, self-selected sample of published articles; "
           "they do not show that any characteristic caused Boost or reach. Small n means noise. Unknown outcomes are not zeros.")
PERF_KEYS = ("views", "reads", "claps", "fans", "earnings")
PUBLISHED = {"published", "live", "public"}


def _find_perf(sources: dict[str, dict]) -> tuple[dict, dict]:
    vals, prov = {}, {}
    for fname, d in sources.items():
        stack = [(d, "")]
        while stack:
            o, path = stack.pop()
            if isinstance(o, dict):
                for k, v in o.items():
                    if k.lower() in PERF_KEYS and isinstance(v, (int, float)) and not isinstance(v, bool) and k.lower() not in vals:
                        vals[k.lower()] = v
                        prov[k.lower()] = f"{fname}:{path}{k}"
                    elif isinstance(v, (dict, list)):
                        stack.append((v, f"{path}{k}."))
            elif isinstance(o, list):
                stack.extend((x, path) for x in o if isinstance(x, dict))
    return vals, prov


def is_published(version: dict, workflow: dict) -> bool:
    for d in (workflow, version):
        if str(d.get("status", "")).lower() in PUBLISHED or d.get("publishedAt") or d.get("publishedUrl") or d.get("mediumUrl"):
            return True
    return False


def _title_features(rec: dict) -> dict:
    m = rec["deterministic"]["metrics"]
    ids = {x["id"] for x in rec["deterministic"]["findings"]}
    t = m.get("title") or ""
    return {"title": t or None, "title_chars": m.get("title_chars", len(t)), "title_words": len(t.split()), "subtitle_chars": m.get("subtitle_chars", 0),
            "is_question": "title_question" in ids, "is_listicle": "title_listicle" in ids, "has_clickbait_phrase": "title_clickbait" in ids,
            "all_caps": "title_all_caps" in ids, "has_pipe_suffix": "title_pipe_suffix" in ids}


def _fingerprint(pkg: Path) -> dict:
    out = {"record_ref": None, "gate_result": None, "author_distance": None, "jsd": None, "repeated_ngram_rate": None}
    runs = sorted((pkg / "evals" / "fingerprint-gate" / "runs").glob("*.json")) if (pkg / "evals" / "fingerprint-gate" / "runs").is_dir() else []
    if runs:
        d = read_json(runs[-1])
        adv = d.get("advisory") or {}
        out.update(record_ref=str(runs[-1]), gate_result=d.get("result") if d.get("result") in ("PASS", "FAIL", "ERROR") else None,
                   author_distance=adv.get("author_distance"), jsd=adv.get("jsd"), repeated_ngram_rate=adv.get("repeated_ngram_rate"))
    return out


def row_from_package(pkg: Path, observed_at: str | None = None) -> dict | None:
    rec = read_json(pkg / "evals" / "medium-distribution" / "MEDIUM_REVIEW.json")
    version, workflow = read_json(pkg / "version.json"), read_json(pkg / "workflow.json")
    queue = read_json(pkg / "queue.json")
    if rec.get("status") != "REVIEWED" or not is_published(version, workflow):
        return None
    sc, b = rec["scorecard"], rec["binding"]
    perf, prov = _find_perf({"workflow.json": workflow, "version.json": version, "queue.json": queue})
    bo = boost_observed(workflow, version, queue)
    sources = dict(prov)
    sources["boost_observed"] = "workflow/version/queue field" if bo is not None else "unavailable"
    outcomes = {"boost_observed": "unknown" if bo is None else bo, "sources": sources}
    for k in PERF_KEYS:
        outcomes[k] = perf.get(k)
    return {
        "schema_version": 1, "slug": pkg.name, "package_path": str(pkg), "content_sha256": b["content_sha256"], "policy_version": b["policy_version"],
        "observed_at": {"review": b["timestamp_utc"], "outcomes": observed_at if (perf or bo is not None) else None,
                        "published": workflow.get("publishedAt") or version.get("publishedAt")},
        "review": {"boost_candidate": sc["boost_candidate"], "general_distribution_risk": sc["general_distribution_risk"],
                   "weakest_dimension": sc["weakest_dimension"], "dimensions": {k: v["rating"] for k, v in sc["dimensions"].items()},
                   "derivative_summary": sc["derivative_summary"], "author_input_required": rec["author_input_required"]["required"],
                   "author_contribution_present": sc["author_contribution"]["present"],
                   "hard_policy_risk_count": len(rec["hard_policy_risks"]), "warning_count": len(rec["warnings"]),
                   "scorecard_ref": str(pkg / "evals" / "medium-distribution" / "MEDIUM_REVIEW.json")},
        "title_features": _title_features(rec), "fingerprint": _fingerprint(pkg), "outcomes": outcomes, "caveat": "correlation, not causation",
    }


def build_rows(workspace: Path, observed_at: str | None = None) -> list[dict]:
    rows = []
    for d in sorted(p for p in workspace.iterdir() if p.is_dir()) if workspace.is_dir() else []:
        r = row_from_package(d, observed_at)
        if r:
            rows.append(r)
    return rows


def _len_bucket(n: int) -> str:
    return "<=60" if n <= 60 else "61-100" if n <= 100 else ">100"


FACTORS = {
    "boost_candidate": lambda r: r["review"]["boost_candidate"],
    "general_distribution_risk": lambda r: r["review"]["general_distribution_risk"],
    "weakest_dimension": lambda r: r["review"]["weakest_dimension"] or "none",
    "derivative_summary": lambda r: str(r["review"].get("derivative_summary")),
    "author_input_required": lambda r: str(r["review"].get("author_input_required")),
    "title_is_question": lambda r: str(r["title_features"].get("is_question", False)),
    "title_is_listicle": lambda r: str(r["title_features"].get("is_listicle", False)),
    "title_has_clickbait_phrase": lambda r: str(r["title_features"].get("has_clickbait_phrase", False)),
    "title_length": lambda r: _len_bucket(r["title_features"]["title_chars"]),
}


def _mean(vals: list[float]):
    return round(sum(vals) / len(vals), 2) if vals else None


def _bucket(rows: list[dict]) -> dict:
    b = {"n": len(rows)}
    known = [r["outcomes"]["boost_observed"] for r in rows if r["outcomes"]["boost_observed"] in (True, False)]
    b["boost_observed"] = {"true": sum(1 for x in known if x is True), "false": sum(1 for x in known if x is False), "unknown": len(rows) - len(known)}
    b["boost_rate_among_known"] = round(b["boost_observed"]["true"] / len(known), 3) if known else None
    for k in ("views", "reads", "claps"):
        vals = [r["outcomes"][k] for r in rows if isinstance(r["outcomes"].get(k), (int, float))]
        b[f"mean_{k}"], b[f"n_with_{k}"] = _mean(vals), len(vals)
    return b


def correlation_table(rows: list[dict]) -> dict:
    """Pure. {wording, n_total, tables: {factor: {bucket: {n, boost_observed, mean_*, n_with_*}}}}."""
    tables = {}
    for name, fn in FACTORS.items():
        groups: dict[str, list[dict]] = {}
        for r in rows:
            groups.setdefault(fn(r), []).append(r)
        tables[name] = {k: _bucket(v) for k, v in sorted(groups.items())}
    return {"wording": WORDING, "n_total": len(rows), "tables": tables}


def to_markdown(table: dict) -> str:
    L = ["# Medium distribution: correlation table", "", f"> {table['wording']}", "", f"Published articles with a review: n={table['n_total']}", ""]
    for name, buckets in table["tables"].items():
        L += [f"## {name}", "", "| bucket | n | boost true/false/unknown | boost rate (known) | mean reads (n) |", "|---|---|---|---|---|"]
        for k, b in buckets.items():
            bo = b["boost_observed"]
            L.append(f"| {k} | {b['n']} | {bo['true']}/{bo['false']}/{bo['unknown']} | {b['boost_rate_among_known']} | {b['mean_reads']} ({b['n_with_reads']}) |")
        L.append("")
    return "\n".join(L)


def write_report(workspace: Path, out_dir: Path, observed_at: str | None = None) -> dict:
    rows = build_rows(workspace, observed_at)
    table = correlation_table(rows)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "rows.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    (out_dir / "correlation.json").write_text(json.dumps(table, indent=2) + "\n")
    (out_dir / "correlation.md").write_text(to_markdown(table))
    return table
