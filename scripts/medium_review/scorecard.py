"""Scorecard persistence + cache.

Cache key = article content sha256 + policy_version + evaluator git SHA. A hit makes zero model calls.
Files under <package>/evals/medium-distribution/:
  <content12>-<policy12>.json   cache-keyed record (kept per article+policy)
  MEDIUM_REVIEW.json            the artifact for the latest run (same content), latest.json is an identical copy
  SUMMARY.md                    human summary of the latest run
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from . import DISCLAIMER, REVIEW_VERSION

REPO = Path(__file__).resolve().parents[2]
PKG = Path(__file__).resolve().parent
RANK = {"weak": 0, "adequate": 1, "strong": 2}
DIMENSIONS = ("writer_experience", "originality", "reader_value", "craftsmanship", "title_quality", "image_quality", "sourcing")


def _git(*args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, timeout=20).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def evaluator_id() -> str:
    """git SHA of the repo; when scripts/medium_review has uncommitted edits append -dirty-<tree12> so a cache
    can never be served across different evaluator code."""
    sha = _git("rev-parse", "HEAD") or "nogit"
    h = hashlib.sha256()
    for p in sorted(PKG.glob("*.py")):
        h.update(p.name.encode() + p.read_bytes())
    dirty = bool(_git("status", "--porcelain", "--", "scripts/medium_review"))
    return f"{sha}-dirty-{h.hexdigest()[:12]}" if dirty else sha


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def weakest_dimension(dims: dict) -> str | None:
    scored = [(RANK[d["rating"]], i, k) for i, (k, d) in enumerate(dims.items()) if d.get("rating") in RANK]
    return min(scored)[2] if scored else None


def cache_path(out_dir: Path, content_sha: str, policy_sha12: str) -> Path:
    return out_dir / f"{content_sha[:12]}-{policy_sha12}.json"


def load_cached(out_dir: Path, content_sha: str, policy: dict, evaluator: str) -> dict | None:
    p = cache_path(out_dir, content_sha, policy["sha12"])
    try:
        rec = json.loads(p.read_text())
    except (OSError, ValueError):
        return None
    b = rec.get("binding", {})
    ok = (rec.get("status") == "REVIEWED" and b.get("content_sha256") == content_sha
          and b.get("policy_version") == policy["policy_version"] and b.get("evaluator_id") == evaluator
          and rec.get("review_version") == REVIEW_VERSION)
    return rec if ok else None


def build_record(*, article_path: Path, content_sha: str, policy: dict, evaluator: str, model: dict, checks: dict,
                 safe_auto_fixes: list[dict], author: dict) -> dict:
    """Assemble the MEDIUM_REVIEW artifact: scorecard dimensions + the explicit sections."""
    dims = {k: model[k] for k in DIMENSIONS}
    hard, warns = [], []
    for fnd in checks["findings"]:
        item = {"source": "deterministic", "id": fnd["id"], "message": fnd["message"], "severity": fnd["severity"], "evidence": fnd["evidence"]}
        (hard if fnd["bucket"] == "hard_policy_risk" else warns).append(item)
    for r in model["distribution_risks"]:
        item = {"source": "model", "category": r["category"], "message": r["risk"], "evidence_quote": r["evidence_quote"]}
        (hard if r["category"] == "hard_policy" else warns).append(item)
    opps = [{"source": "model", "recommendation": r} for r in model["recommendations"]]
    opps += [{"source": "model", "dimension": k, "rating": d["rating"], "recommendation": d["note"]}
             for k, d in dims.items() if d["rating"] == "weak" and d.get("note")]
    return {
        "schema_version": 1, "review_version": REVIEW_VERSION, "status": "REVIEWED", "advisory": True, "disclaimer": DISCLAIMER,
        "binding": {"article_path": str(article_path), "content_sha256": content_sha, "policy_version": policy["policy_version"],
                    "policy_sha256": policy["sha256"], "policy_date": str(policy.get("fetched_at", ""))[:10],
                    "policy_updated_at": policy.get("updated_at"), "policy_fetch_status": policy.get("fetch_status"),
                    "policy_fetch_method": policy.get("method"), "evaluator_id": evaluator, "timestamp_utc": now_utc()},
        "scorecard": {"dimensions": dims, "weakest_dimension": weakest_dimension(dims),
                      "boost_candidate": model["boost_candidate"], "general_distribution_risk": model["general_distribution_risk"],
                      "derivative_summary": model["derivative_summary"],
                      "author_contribution": model["author_contribution"]},
        "hard_policy_risks": hard, "warnings": warns, "boost_quality_opportunities": opps,
        "safe_auto_fixes": safe_auto_fixes, "author_input_required": author,
        "deterministic": {"metrics": checks["metrics"], "findings": checks["findings"]},
        "cache_hit": False,
    }


def save(out_dir: Path, rec: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    b = rec["binding"]
    p = cache_path(out_dir, b["content_sha256"], b["policy_sha256"][:12])
    if p.exists():  # evaluator/policy-version change over same file name: keep the old record
        try:
            old = json.loads(p.read_text())
            tag = str(old.get("binding", {}).get("evaluator_id", "old"))[:10]
            p.rename(p.with_suffix(f".{tag}.{int(datetime.now().timestamp())}.json"))
        except (OSError, ValueError):
            pass
    write_latest(out_dir, rec)
    p.write_text(json.dumps(rec, indent=2) + "\n")
    return p


def write_latest(out_dir: Path, rec: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(rec, indent=2) + "\n"
    (out_dir / "MEDIUM_REVIEW.json").write_text(text)
    (out_dir / "latest.json").write_text(text)
    (out_dir / "SUMMARY.md").write_text(summary_md(rec))


def write_error(out_dir: Path, article_path: Path, content_sha: str | None, error: str, policy: dict | None, evaluator: str) -> dict:
    rec = {"schema_version": 1, "status": "ERROR", "advisory": True, "disclaimer": DISCLAIMER, "error": error[:1000],
           "binding": {"article_path": str(article_path), "content_sha256": content_sha,
                       "policy_version": (policy or {}).get("policy_version"), "evaluator_id": evaluator, "timestamp_utc": now_utc()}}
    write_latest(out_dir, rec)
    return rec


def summary_md(rec: dict) -> str:
    b = rec["binding"]
    L = ["# Medium distribution review (advisory)", "", f"> {DISCLAIMER}", ""]
    if rec["status"] != "REVIEWED":
        return "\n".join(L + [f"Status: ERROR  ", f"Error: {rec.get('error')}", f"Article sha256: `{b.get('content_sha256')}`", ""])
    s = rec["scorecard"]
    L += [f"- Article sha256: `{b['content_sha256']}`", f"- Policy: `{b['policy_version']}` ({b['policy_date']}, {b['policy_fetch_status']})",
          f"- Evaluator: `{b['evaluator_id']}`  Time: {b['timestamp_utc']}  Cache hit: {rec.get('cache_hit')}", "",
          f"**Boost candidate:** {s['boost_candidate']}  |  **General distribution risk:** {s['general_distribution_risk']}  |  "
          f"**Weakest dimension:** {s['weakest_dimension']}  |  **Derivative summary:** {s['derivative_summary']}", "", "## Dimensions", ""]
    for k, d in s["dimensions"].items():
        q = f' "{d["evidence_quote"]}"' if d.get("evidence_quote") else ""
        L.append(f"- {k}: {d['rating']}{' (quote not found in article)' if d.get('quote_found') is False else ''}. {d.get('note', '')}{q}")
    for title, key in (("Hard policy risks", "hard_policy_risks"), ("Warnings", "warnings"),
                       ("Boost quality opportunities", "boost_quality_opportunities"), ("Safe auto fixes", "safe_auto_fixes")):
        L += ["", f"## {title}", ""]
        items = rec[key]
        L += [f"- {i.get('message') or i.get('recommendation') or i.get('description')}" for i in items] or ["- none"]
    a = rec["author_input_required"]
    L += ["", "## Author input", "", f"Required: {a['required']}. {a['reason']}"]
    L += [f"- {m['path']}:{m.get('line', '')} {m.get('excerpt', '')}" for m in a["candidate_trusted_material"]]
    return "\n".join(L) + "\n"
