"""Safety guards for a rewrite: semantic drift, claim preservation, structure."""
from __future__ import annotations

import math

from .errors import EvaluationError
from .gateway import embed, validate_embeddings
from .refs import find_refs, lost
from .textutil import Block, parse_blocks, strip_inline


def _embed(texts: list[str]) -> list[list[float]]:
    return validate_embeddings(embed(texts), len(texts))  # re-validated here: count, dims, finite


def _cos(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        raise EvaluationError(f"similarity: dimension mismatch ({len(a)} vs {len(b)})")
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    if not na or not nb:
        raise EvaluationError("similarity: zero vector")
    c = sum(x * y for x, y in zip(a, b)) / (na * nb)
    if not math.isfinite(c):
        raise EvaluationError("similarity: non-finite value")
    return c


def _chunks(text: str, max_words: int = 300) -> list[str]:
    out, cur, n = [], [], 0
    for p in [p for p in text.split("\n\n") if p.strip()]:
        w = len(p.split())
        if cur and n + w > max_words:
            out.append("\n\n".join(cur)); cur, n = [], 0
        cur.append(p); n += w
    if cur:
        out.append("\n\n".join(cur))
    return out


def _mean(vs: list[list[float]]) -> list[float]:
    if not vs:
        raise EvaluationError("similarity: nothing to average")
    return [sum(v[i] for v in vs) / len(vs) for i in range(len(vs[0]))]


def sections(md: str) -> list[tuple[str, str]]:
    """(key, prose text) per h2+ section; intro first. Prose = paragraphs only.
    key = heading text, with an occurrence suffix from the second use of the same heading on (`Heading #2`),
    so repeated headings never collapse into one entry."""
    out: list[tuple[str, list[str]]] = [("(intro)", [])]
    seen: dict[str, int] = {}
    for b in parse_blocks(md):
        if b.kind == "heading" and not b.text.startswith("# "):
            h = b.text.lstrip("# ").strip()
            seen[h] = seen.get(h, 0) + 1
            out.append((h if seen[h] == 1 else f"{h} #{seen[h]}", []))
        elif b.kind == "paragraph":
            out[-1][1].append(strip_inline(b.text).replace("\n", " "))
    return [(h, "\n\n".join(ps)) for h, ps in out if ps]


def semantic_similarity(original: str, rewrite: str) -> dict:
    """nomic-embed-text cosine: whole document (mean-pooled chunks) and per section. Sections present on only one side
    still count toward the whole-document score (dropped original sections and added rewrite sections both pull it down)."""
    so, sr = dict(sections(original)), dict(sections(rewrite))
    per: dict[str, float] = {}
    all_o, all_r = [], []
    for h, t in so.items():
        co = _embed(_chunks(t))
        all_o += co
        if h not in sr:
            per[h] = 0.0
            continue
        cr = _embed(_chunks(sr[h]))
        per[h] = _cos(_mean(co), _mean(cr))
        all_r += cr
    extra = [h for h in sr if h not in so]
    for h in extra:
        all_r += _embed(_chunks(sr[h]))
    whole = _cos(_mean(all_o), _mean(all_r)) if all_o and all_r else 0.0
    vals = list(per.values())
    return {"whole": whole, "section_mean": sum(vals) / max(len(vals), 1), "section_min": min(vals) if vals else 0.0, "per_section": per,
            "unmatched_rewrite_sections": extra}


def structure_preservation(original: str, rewrite: str) -> dict:
    """Headings and code blocks verbatim and in order; images anywhere (inline, reference) in order;
    links of every kind (inline, reference + definitions, autolinks, bare URLs) not lost."""
    bo, br = parse_blocks(original), parse_blocks(rewrite)

    def texts(bs: list[Block], kind: str) -> list[str]:
        return [b.text for b in bs if b.kind == kind]

    res: dict = {}
    for kind in ("heading", "code"):
        o, r = texts(bo, kind), texts(br, kind)
        res[kind + "s"] = {"original": len(o), "rewrite": len(r), "preserved": o == r,
                           "missing": [x for x in o if x not in r][:10]}
    ro, rr = find_refs(original), find_refs(rewrite)
    io, ir = ro["images"], rr["images"]
    res["images"] = {"original": len(io), "rewrite": len(ir), "preserved": io == ir, "missing": lost(io, ir)[:10], "added": lost(ir, io)[:10]}
    gone = lost(ro["links"], rr["links"])
    res["links"] = {"original": len(ro["links"]), "rewrite": len(rr["links"]), "preserved": not gone, "missing": gone[:20]}
    res["all_preserved"] = all(v["preserved"] for v in res.values() if isinstance(v, dict))
    return res


def frozen_blocks(md: str) -> list[str]:
    """Blocks no check reads as claims: lists, quotes, code, tables, images, rules, short or boilerplate paragraphs."""
    from .rewrite import segment_article
    return [b.text for seg in segment_article(md) if seg.frozen for b in seg.blocks if b.kind != "heading"]


def frozen_diff(original: str, rewrite: str, limit: int = 12) -> list[str]:
    """Exact comparison of frozen blocks; empty list = identical. Lines are unified-diff lines for the failure reason."""
    import difflib
    o, r = frozen_blocks(original), frozen_blocks(rewrite)
    if o == r:
        return []
    lines = lambda bs: "\n\n".join(bs).split("\n")  # noqa: E731  line-level diff reads better than block-level
    return list(difflib.unified_diff(lines(o), lines(r), "reference", "final", lineterm="", n=0))[:limit] or ["frozen blocks differ"]
from .judge import judge_claims  # noqa: E402,F401  (re-export; implementation lives in judge.py)
