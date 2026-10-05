"""decide(): pure, deterministic route decision over the two artifacts plus package metadata. No I/O, no model.

Check 1 (integrity) is the release gate; Check 2 (editorial) is the advisory MEDIUM_REVIEW.json. Exactly one route:
  A DIRECT_PUBLISH       Check 1 PASS and Check 2 finds the piece suitable.
  B PUBLICATION_ROUTE    Check 1 PASS, a human-edited Medium publication is the better route. Candidates come only from the
                         curated list; no match gives detail B_NEEDS_PUBLICATION_RESEARCH.
  C AUTO_REPAIR          safe deterministic problems; the caller applies `repairs`, reruns BOTH checks, decides again.
  D QUARANTINE           real integrity/policy problem that cannot be fixed safely.
Boost likelihood is a recommendation: it is never an input to the route.

Inputs (plain dicts):
  check1  {"state": PASS | NEEDS_AUTHORIZE | QUARANTINED | QUARANTINED_RETRYABLE, "integrity_record_id", "reason"}
  review  parsed MEDIUM_REVIEW.json, or None when absent/ERROR/stale for the current bytes
  meta    {"images", "images_with_provenance", "title", "subtitle", "title_candidates", "subtitle_candidates",
           "queue_item": {"channel", "source_name"}, "topics"}
  publications  already-validated entries (publications.load()["valid"])
"""
from __future__ import annotations

import re

from . import publications as PUB

ROUTES = {"A": "DIRECT_PUBLISH", "B": "PUBLICATION_ROUTE", "C": "AUTO_REPAIR", "D": "QUARANTINE"}
CONTENT_FIX_KINDS = ("alt_text", "image_credit", "formatting", "source_links", "dedupe")
SUBTITLE_MAX = 140
RIGHTS_RE = re.compile(r"image|photo|frame|picture|screenshot|thumbnail|credit|permission|licen[sc]e|copyright|attribution|rights", re.I)


def _out(code: str, reasons: list[str], *, detail: str | None = None, repairs=None, candidates=None, topics=None, actions=None) -> dict:
    return {"route": ROUTES[code], "route_code": code, "detail": detail or ROUTES[code], "reasons": reasons,
            "repairs": repairs or [], "actions": actions or [], "publication_candidates": candidates or [], "topics": topics or []}


def own_repairs(review: dict, meta: dict) -> list[dict]:
    """Title/subtitle repairs the router makes itself, each gated on an already-approved source of the new text."""
    reps = []
    sub = meta.get("subtitle") or ""
    if sub and len(sub) > SUBTITLE_MAX:
        cands = [c["subtitle"] for c in meta.get("title_candidates", []) if isinstance(c, dict) and isinstance(c.get("subtitle"), str)]
        cands += [c for c in meta.get("subtitle_candidates", []) if isinstance(c, str)]
        pick = next((c.strip() for c in cands if c.strip() and len(c.strip()) <= SUBTITLE_MAX), None)
        if pick:
            reps.append({"kind": "subtitle_trim", "from": sub, "to": pick, "basis": "approved shorter variant in title candidates"})
    title = meta.get("title") or ""
    if " | " in title:
        suffix = title.rsplit(" | ", 1)[1].strip()
        qi = meta.get("queue_item") or {}
        names = [qi.get(k) for k in ("channel", "source_name") if isinstance(qi.get(k), str) and qi.get(k)]
        if suffix and suffix in names:
            reps.append({"kind": "title_suffix_strip", "suffix": suffix, "basis": "suffix equals the queue item's channel/source name exactly"})
    return reps


def decide(check1: dict, review: dict | None, meta: dict, publications: list[dict]) -> dict:
    topics = [t for t in meta.get("topics", []) if isinstance(t, str)]
    state = check1.get("state")
    if state == "QUARANTINED":
        return _out("D", [f"Check 1 quarantine: {check1.get('reason') or 'integrity gate quarantined these bytes'}"], topics=topics)
    if review is None:
        return _out("C", ["Check 2 missing, stale for the current bytes, or ERROR: rerun the Medium review"],
                    actions=["review"] + (["authorize"] if state != "PASS" else []), topics=topics)

    reasons: list[str] = []
    fixes = [f for f in review.get("safe_auto_fixes", []) if isinstance(f, dict) and f.get("status") == "available"]
    content_fixes = [f["kind"] for f in fixes if f.get("kind") in CONTENT_FIX_KINDS]

    # policy: a hard risk is never reworded away; only a rights risk with recorded provenance and an available credit fix is repairable
    imgs, prov = int(meta.get("images", 0)), int(meta.get("images_with_provenance", 0))
    for r in review.get("hard_policy_risks", []):
        msg = (r.get("message") if isinstance(r, dict) else str(r)) or "hard policy risk"
        text = f"{msg} {r.get('evidence_quote', '') if isinstance(r, dict) else ''}"
        if RIGHTS_RE.search(text):
            if imgs and prov >= imgs and "image_credit" in content_fixes:
                reasons.append(f"rights risk with recorded provenance; credit line is a safe fix: {msg}")
                continue
            why = "no recorded provenance for some images" if prov < imgs else "provenance recorded but no safe credit fix applies"
            return _out("D", [f"Check 2 hard policy risk (image rights): {msg}; {why}"], topics=topics)
        return _out("D", [f"Check 2 hard policy risk: {msg}"], topics=topics)

    repairs = [{"kind": k, "source": "medium_review.autofix"} for k in dict.fromkeys(content_fixes)] + own_repairs(review, meta)
    needs_auth = state in ("NEEDS_AUTHORIZE", "QUARANTINED_RETRYABLE")
    if repairs or needs_auth:
        acts = (["repair"] if repairs else []) + ["authorize", "review"]
        if needs_auth:
            reasons.append(f"Check 1 not PASS for the current bytes ({check1.get('reason') or 'not authorized'}): rerun release authorize")
        if repairs:
            reasons.append("safe deterministic fixes: " + ", ".join(r["kind"] for r in repairs))
        return _out("C", reasons, repairs=repairs, actions=acts, topics=topics)

    # Check 1 PASS from here. Boost is never consulted.
    sc = review.get("scorecard", {})
    ac, aiq, dims = sc.get("author_contribution", {}), review.get("author_input_required", {}), sc.get("dimensions", {})
    unsuitable = []
    if sc.get("derivative_summary"):
        unsuitable.append("derivative summary of source material")
    if not ac.get("integral"):
        unsuitable.append("author contribution not integral")
    if sc.get("general_distribution_risk") == "HIGH":
        unsuitable.append("general distribution risk HIGH")
    unsuitable += [f"{k} weak" for k in ("writer_experience", "originality") if dims.get(k, {}).get("rating") == "weak"]
    if aiq.get("required"):
        unsuitable.append("author input required: " + str(aiq.get("reason", ""))[:160])
    if not unsuitable:
        return _out("A", ["Check 1 PASS; Check 2 finds author contribution integral and no distribution blockers",
                          f"Boost is {sc.get('boost_candidate')} (recommendation only, not a gate)"], topics=topics)

    cands = PUB.match(publications, topics)
    has_material = bool(aiq.get("candidate_trusted_material"))
    if aiq.get("required") and not has_material and not cands:
        return _out("D", ["author_input_required with no genuine author material and no listed publication to route to: " + "; ".join(unsuitable)], topics=topics)
    reasons = ["a human-edited publication is the better route: " + "; ".join(unsuitable)]
    if cands:
        return _out("B", reasons, detail="B_PUBLICATION_CANDIDATES", candidates=cands, topics=topics)
    return _out("B", reasons + ["publications.json has no entry matching these topics; research needed (docs/medium-publications-research.md)"],
                detail="B_NEEDS_PUBLICATION_RESEARCH", topics=topics)
