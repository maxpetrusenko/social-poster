"""Proposition extraction with a cache bound to content: source sha256, per-segment hashes, extractor, schema version.

Any mismatch or missing segment regenerates everything; a cache is never trusted past what it can prove.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .contracts import Category
from .errors import EvaluationError
from .gateway import GatewayError, resolve_model
from .rewrite import Segment, extract_propositions, is_meta_claim

SCHEMA_VERSION = 2


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def extractor_id(spec: str) -> str:
    m = resolve_model(spec)
    return f"{m.backend}:{m.model_id}"


def segment_hash(seg: Segment) -> str:
    return sha256(f"{seg.section}\0{seg.text}")


def _load_valid(path: Path, md: str, extractor: str, prose: list[Segment]) -> dict | None:
    try:
        saved = json.loads(path.read_text())
        if saved["schema_version"] != SCHEMA_VERSION or saved["source_sha256"] != sha256(md) or saved["extractor"] != extractor:
            return None
        entries = saved["segments"]
        return entries if all(entries[str(s.idx)]["hash"] == segment_hash(s) for s in prose) else None
    except (OSError, ValueError, KeyError, TypeError):
        return None


def ensure_extraction(segs: list[Segment], md: str, extractor_spec: str, cache: Path, refresh: bool = False) -> str:
    """Fill propositions on non-frozen segments (from a valid cache or the extractor). Returns "cache" or "extracted".
    Raises EvaluationError if extraction fails or any prose segment ends with zero claims."""
    ext = extractor_id(extractor_spec)
    prose = [s for s in segs if not s.frozen]
    entries = None if refresh else _load_valid(cache, md, ext, prose)
    if entries is not None:
        for s in prose:
            e = entries[str(s.idx)]
            s.role = str(e.get("role", ""))
            s.propositions = [q for q in e.get("propositions", []) if isinstance(q, dict) and isinstance(q.get("claim"), str) and not is_meta_claim(q["claim"])]
        source = "cache"
    else:
        for s in prose:
            try:
                extract_propositions(s, extractor_spec)
            except (GatewayError, ValueError) as e:
                raise EvaluationError(f"extraction failed: {str(e)[:250]}", category=getattr(e, "category", Category.MALFORMED_MODEL_OUTPUT), dependency=getattr(e, "dependency", None)) from None
        source = "extracted"
        body = {"schema_version": SCHEMA_VERSION, "source_sha256": sha256(md), "extractor": ext,
                "segments": {str(s.idx): {"hash": segment_hash(s), "section": s.section, "role": s.role, "propositions": s.propositions} for s in prose}}
        try:
            cache.write_text(json.dumps(body, indent=1, ensure_ascii=False))
        except OSError as e:
            raise EvaluationError(f"cannot write extraction cache: {e}") from None
    empty = [s.idx for s in prose if not s.propositions]
    if empty:
        raise EvaluationError(f"prose segments with zero claims: {empty}")
    return source
