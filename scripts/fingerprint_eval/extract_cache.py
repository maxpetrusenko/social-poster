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
from .added import _is_factual, sentence_covered
from .rewrite import Segment, extract_propositions, is_meta_claim, request_extraction, segment_sentences
from .textutil import strip_inline

SCHEMA_VERSION = 4  # 3: propositions carry sentence_ids; reference sentence coverage is enforced. 4: extractor keeps hedges and quantifiers verbatim in the claim text


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


def reference_gaps(seg: Segment) -> list[int]:
    """1-based ids of factual sentences of a prose segment that no proposition covers (tagged, or >= 50% of the sentence's content tokens)."""
    tagged = {i for p in seg.propositions for i in p.get("sentence_ids", []) if isinstance(i, int)}
    claims = [p["claim"] for p in seg.propositions]
    return [i for i, sent in enumerate(segment_sentences(seg), 1)
            if _is_factual(strip_inline(sent)) and not sentence_covered(strip_inline(sent), claims, i in tagged)]


def _cover_reference(prose: list[Segment], extractor_spec: str) -> bool:
    """Every factual sentence of every prose segment must be covered. One targeted re-extraction of just the uncovered
    sentences per segment, then EvaluationError (MALFORMED_MODEL_OUTPUT). Returns True if any re-extraction changed a segment."""
    changed = False
    for s in prose:
        gaps = reference_gaps(s)
        if not gaps:
            continue
        sents = segment_sentences(s)
        try:
            _, props = request_extraction([sents[i - 1] for i in gaps], s.section, extractor_spec)
        except (GatewayError, ValueError) as e:
            raise EvaluationError(f"re-extraction of {len(gaps)} uncovered reference sentence(s) failed in segment {s.idx}: {str(e)[:200]}", category=getattr(e, "category", Category.MALFORMED_MODEL_OUTPUT), dependency=getattr(e, "dependency", None)) from None
        for p in props:
            p["sentence_ids"] = [gaps[i - 1] for i in p["sentence_ids"]]
        s.propositions = s.propositions + props
        changed = True
        left = reference_gaps(s)
        if left:
            raise EvaluationError(f"reference sentence(s) with no extracted proposition in segment {s.idx} after re-extraction: {strip_inline(sents[left[0] - 1])[:100]!r}", category=Category.MALFORMED_MODEL_OUTPUT)
    return changed


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
    empty = [s.idx for s in prose if not s.propositions]
    if empty:
        raise EvaluationError(f"prose segments with zero claims: {empty}", category=Category.MALFORMED_MODEL_OUTPUT)
    if _cover_reference(prose, extractor_spec) or source == "extracted":
        body = {"schema_version": SCHEMA_VERSION, "source_sha256": sha256(md), "extractor": ext,
                "segments": {str(s.idx): {"hash": segment_hash(s), "section": s.section, "role": s.role, "propositions": s.propositions} for s in prose}}
        try:
            cache.write_text(json.dumps(body, indent=1, ensure_ascii=False))
        except OSError as e:
            raise EvaluationError(f"cannot write extraction cache: {e}") from None
        source = "extracted"
    return source
