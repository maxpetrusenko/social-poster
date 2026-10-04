"""Deterministic EvalRecord -> Category. Reads structured fields only; never parses an LLM's prose.

Inputs, in priority order: record.result, record.category / record.error_category,
record.failure_categories (all content categories found, cheapest first), then the structured
counters in record.links / record.structure / record.claims. `reasons` is consulted only for exact
enum tokens (e.g. "MISSING_LINK: ..."), never for free text.
"""
from __future__ import annotations

import re

from .contracts import CONTENT_CATEGORIES, INFRA_CATEGORIES, Category, EvalRecord, Result

_TOKEN = re.compile(r"\b[A-Z][A-Z_]{5,}\b")


def _coerce(value) -> Category | None:
    if isinstance(value, Category):
        return value
    try:
        return Category(str(getattr(value, "value", value)))
    except ValueError:
        return None


def _result(record: EvalRecord) -> Result | None:
    try:
        return Result(str(getattr(record.result, "value", record.result)))
    except ValueError:
        return None


def _structure_damaged(structure: dict) -> bool:
    for v in (structure or {}).values():
        if not isinstance(v, dict):
            continue
        if v.get("diffs") or v.get("missing"):
            return True
        pres, exp = v.get("preserved"), v.get("expected")
        if pres is False:
            return True
        if isinstance(pres, int) and not isinstance(pres, bool) and isinstance(exp, int) and pres < exp:
            return True
    return False


def failure_categories(record: EvalRecord) -> list[Category]:
    """All content categories that apply to a FAIL record, deduplicated, gate order preserved."""
    cats: list[Category] = []

    def add(c: Category | None) -> None:
        if c in CONTENT_CATEGORIES and c not in cats:
            cats.append(c)

    if getattr(record, "reference_path", True) is None:
        add(Category.MISSING_SOURCE)
    for c in getattr(record, "failure_categories", None) or []:
        add(_coerce(c))
    add(_coerce(getattr(record, "category", None)))
    for reason in getattr(record, "reasons", None) or []:
        for tok in _TOKEN.findall(str(reason)):
            add(_coerce(tok))
    if cats:
        return cats
    # Fallback: structured counters (still no prose parsing).
    links = getattr(record, "links", None) or {}
    if links.get("missing") or (isinstance(links.get("expected"), int) and isinstance(links.get("preserved"), int)
                                and links["preserved"] < links["expected"]):
        add(Category.MISSING_LINK)
    if _structure_damaged(getattr(record, "structure", None) or {}):
        add(Category.STRUCTURAL_DAMAGE)
    claims = getattr(record, "claims", None) or {}
    if (claims.get("changed") or 0) + (claims.get("missing") or 0) > 0:
        add(Category.CONTENT_CLAIM_FAILURE)
    if (claims.get("added_unsupported") or 0) > 0:
        add(Category.ADDED_UNSUPPORTED_CLAIM)
    return cats


def classify(record: EvalRecord) -> Category:
    res = _result(record)
    if res is Result.PASS:
        return Category.PASS
    if res is Result.ERROR:
        for attr in ("error_category", "category"):
            c = _coerce(getattr(record, attr, None))
            if c in INFRA_CATEGORIES:
                return c
        return Category.UNKNOWN_ERROR
    if res is Result.FAIL:
        cats = failure_categories(record)
        if Category.MISSING_SOURCE in cats:
            return Category.MISSING_SOURCE
        return cats[0] if cats else Category.NEEDS_REVIEW
    return Category.UNKNOWN_ERROR


def is_infra(category: Category) -> bool:
    return category in INFRA_CATEGORIES


def is_content(category: Category) -> bool:
    return category in CONTENT_CATEGORIES
