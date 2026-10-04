"""Safety guards for a rewrite: semantic drift, claim preservation, structure."""
from __future__ import annotations

import json
import math
import re

from .gateway import GatewayError, Model, embed, extract_json
from .rewrite import Segment, links_in
from .textutil import Block, parse_blocks, strip_inline, words


def _cos(a: list[float], b: list[float]) -> float:
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b)) / (na * nb) if na and nb else 0.0


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
    return [sum(v[i] for v in vs) / len(vs) for i in range(len(vs[0]))]


def sections(md: str) -> list[tuple[str, str]]:
    """(heading, prose text) per h2+ section; intro first. Prose = paragraphs only."""
    out: list[tuple[str, list[str]]] = [("(intro)", [])]
    for b in parse_blocks(md):
        if b.kind == "heading" and not b.text.startswith("# "):
            out.append((b.text.lstrip("# ").strip(), []))
        elif b.kind == "paragraph":
            out[-1][1].append(strip_inline(b.text).replace("\n", " "))
    return [(h, "\n\n".join(ps)) for h, ps in out if ps]


def semantic_similarity(original: str, rewrite: str) -> dict:
    """nomic-embed-text cosine: whole document (mean-pooled chunks) and per section."""
    so, sr = dict(sections(original)), dict(sections(rewrite))
    per: dict[str, float] = {}
    all_o, all_r = [], []
    for h, t in so.items():
        if h not in sr:
            per[h] = 0.0
            continue
        co, cr = embed(_chunks(t)), embed(_chunks(sr[h]))
        per[h] = _cos(_mean(co), _mean(cr))
        all_o += co
        all_r += cr
    whole = _cos(_mean(all_o), _mean(all_r)) if all_o else 0.0
    vals = list(per.values())
    return {"whole": whole, "section_mean": sum(vals) / max(len(vals), 1), "section_min": min(vals) if vals else 0.0, "per_section": per}


def structure_preservation(original: str, rewrite: str) -> dict:
    """Headings, image lines, code blocks, markdown links: verbatim and in order."""
    bo, br = parse_blocks(original), parse_blocks(rewrite)

    def texts(bs: list[Block], kind: str) -> list[str]:
        return [b.text for b in bs if b.kind == kind]

    res: dict = {}
    for kind in ("heading", "image", "code"):
        o, r = texts(bo, kind), texts(br, kind)
        res[kind + "s"] = {"original": len(o), "rewrite": len(r), "preserved": o == r,
                           "missing": [x for x in o if x not in r][:10]}
    lo, lr = links_in(original), links_in(rewrite)
    lost = [l for l in lo if l not in lr]
    res["links"] = {"original": len(lo), "rewrite": len(lr), "preserved": not lost, "missing": lost[:20]}
    res["all_preserved"] = all(v["preserved"] for v in res.values() if isinstance(v, dict))
    return res


JUDGE_PROMPT = """/no_think
You check whether a rewritten passage still states each claim from the original.
For each numbered claim give a verdict:
- "entailed": the passage states it or clearly implies it, with the same names, numbers, and causal direction
- "changed": the passage states something different (altered number, name, causality, certainty)
- "missing": the passage does not state it
Return ONLY JSON: [{{"i": 1, "verdict": "entailed", "reason": "<=15 words"}}, ...]

Claims:
{claims}

Rewritten passage:
{passage}
"""


def judge_claims(segments: list[Segment], judge: Model) -> dict:
    """Per-segment batch judging of extracted claims against the rewritten segment."""
    counts = {"entailed": 0, "changed": 0, "missing": 0, "unjudged": 0}
    flagged: list[dict] = []
    for seg in segments:
        if seg.frozen or not seg.propositions:
            continue
        claims = "\n".join(f"{i + 1}. {p['claim']}" for i, p in enumerate(seg.propositions))
        verdicts = None
        for _ in range(2):
            try:
                raw = judge.complete(JUDGE_PROMPT.format(claims=claims, passage=seg.output), **({"temperature": 0.0, "max_tokens": 6000} if judge.backend == "gateway" else {}))
                verdicts = {int(v["i"]): v for v in extract_json(raw)}
                break
            except (GatewayError, KeyError, ValueError, TypeError):
                continue
        for i, p in enumerate(seg.propositions, 1):
            v = (verdicts or {}).get(i)
            verdict = (v or {}).get("verdict", "unjudged")
            verdict = verdict if verdict in counts else "unjudged"
            counts[verdict] += 1
            if verdict in ("changed", "missing", "unjudged"):
                flagged.append({"section": seg.section, "claim": p["claim"], "verdict": verdict, "reason": (v or {}).get("reason", "judge returned no verdict")})
    total = sum(counts.values())
    return {"judge": judge.name, "total": total, **{f"claims_{k}": v for k, v in counts.items()}, "flagged": flagged}
