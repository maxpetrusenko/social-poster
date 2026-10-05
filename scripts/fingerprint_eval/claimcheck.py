"""Deterministic claim checks between the rated reference and the final. No LLM: lexicon and alignment only.

Two checks, both FAIL-only (a FAIL is cheap: the healer restores the section from the rated reference; a missed factual
change is expensive, so every doubt resolves toward FAIL):

1. Sentence features. Every reference prose sentence is aligned to the final sentence(s) that carry it (merge and split
   aware). Within an aligned group the union of (numbers, negations, hedge/certainty/quantifier lexicon) of the reference
   side must equal the final side. Any add, remove or swap is a "changed" finding (CONTENT_CLAIM_FAILURE).
2. Removed sentence. A reference prose sentence with >= MIN_REMOVED_TOKENS content tokens that no final sentence carries
   is a "missing" finding, whatever the extractor produced.

Alignment is lexical first (content-token containment of the reference sentence in one final sentence or two adjacent
ones). A sentence that fails lexically gets ONE embedding rescue against the final sentences of its own section, so a
heavy paraphrase is not mistaken for a removal. Embeddings are only requested when some reference sentence is unaligned.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from . import guards
from .added import _content_tokens, _signature
from .rewrite import segment_article
from .textutil import split_sentences, strip_inline

SINGLE_STRONG = 0.7     # containment of the reference sentence in ONE final sentence: aligned to that sentence
PAIR_MIN = 0.6          # containment in two adjacent final sentences (a split)
SINGLE_MIN = 0.5        # weaker single-sentence alignment, used when no pair is better
EMBED_ALIGN = 0.85      # cosine rescue for lexically unaligned sentences (paraphrase); chosen on held-out set 1, confirmed on set 2
MIN_FEATURE_TOKENS = 3  # shorter reference sentences are not aligned reliably
MIN_REMOVED_TOKENS = 4  # a reference sentence needs this many content tokens before a missing counterpart fails

_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")


def _verb(base: str, *extra: str) -> dict[str, str]:
    stem = base[:-1] if base.endswith("e") else base
    forms = {base, base + "s", base + "es", stem + "ed", base + "d", stem + "ing", *extra}
    return {f: base for f in forms}


_LEX: dict[str, str] = {}
for _w in ("may", "might", "could", "can", "likely", "unlikely", "possibly", "probably", "perhaps", "partly", "partially", "some", "many",
           "most", "all", "every", "always", "never", "often", "rarely", "approximately", "nearly", "almost", "only",
           # beyond the brief: the same family (modal, frequency, quantity words)
           "will", "would", "should", "must", "usually", "typically", "generally", "sometimes", "few", "several", "mostly", "largely",
           "mainly", "seldom", "definitely", "certainly", "clearly", "possible", "probable", "potentially", "roughly", "virtually"):
    _LEX[_w] = _w
for _v, _x in (("suggest", ()), ("indicate", ()), ("show", ("shown",)), ("prove", ("proven", "proved")), ("demonstrate", ()), ("confirm", ()),
               ("appear", ()), ("seem", ()), ("believe", ()), ("estimate", ()), ("expect", ()), ("tend", ()), ("imply", ("implies", "implied")),
               ("establish", ())):
    _LEX.update(_verb(_v, *_x))
_LEX.update({"suggest": "suggest", "cannot": "can", "can't": "can", "won't": "will", "wouldn't": "would", "couldn't": "could"})
PHRASES = (("at least", "at least"), ("up to", "up to"), ("at most", "at most"), ("more than", "more than"), ("less than", "less than"),
           ("fewer than", "fewer than"), ("a few", "few"), ("part of", "some"), ("no more than", "no more than"), ("as many as", "as many as"))
_ABOUT_NUM = re.compile(r"\babout\s+(?:[$£€]\s?)?(?:\d|(?:a|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|half|a half)\b)")


def modality(sentence: str) -> frozenset[str]:
    """Hedge, certainty and quantifier terms of a sentence, lemmatised (shows/showed/shown are one term)."""
    text = sentence.lower().replace("’", "'")
    found = {lemma for phrase, lemma in PHRASES if re.search(rf"\b{phrase}\b", text)}
    if _ABOUT_NUM.search(text):
        found.add("about")
    found.update(_LEX[w] for w in _WORD.findall(text) if w in _LEX)
    return frozenset(found)


def features(sentences: list[str]) -> dict[str, frozenset[str]]:
    """Union of numbers, negations and modality terms over the sentences."""
    nums: set[str] = set()
    negs: set[str] = set()
    mods: set[str] = set()
    for s in sentences:
        n, g, _ = _signature(s)
        nums |= n
        negs |= g
        mods |= modality(s)
    return {"numbers": frozenset(nums), "negations": frozenset(negs), "modality": frozenset(mods)}


def _stem(t: str) -> str:
    for suf in ("ing", "ed", "es", "s", "ly"):
        if len(t) > 4 and t.endswith(suf):
            return t[: -len(suf)]
    return t


def _tokens(sentence: str) -> frozenset[str]:
    return frozenset(_stem(t) for t in _content_tokens(sentence))


@dataclass
class Sent:
    text: str
    section: str
    section_idx: int
    toks: frozenset[str] = field(default_factory=frozenset)


def prose_sentences(md: str) -> list[Sent]:
    """Plain-text sentences of every non-frozen prose segment, in document order (frozen blocks are compared byte-exact elsewhere)."""
    out: list[Sent] = []
    for seg in segment_article(md):
        if seg.frozen:
            continue
        for b in seg.blocks:
            for s in split_sentences(strip_inline(b.text).replace("\n", " ")):
                out.append(Sent(s, seg.section, seg.section_idx, _tokens(s)))
    return out


def _contain(r: frozenset[str], f: frozenset[str]) -> float:
    return len(r & f) / len(r) if r else 1.0


def _lexical(r: Sent, final: list[Sent]) -> tuple[tuple[int, ...] | None, float]:
    """(final indices carrying r, containment) or (None, best containment seen)."""
    best_s = max(range(len(final)), key=lambda j: _contain(r.toks, final[j].toks), default=None)
    cs = _contain(r.toks, final[best_s].toks) if best_s is not None else 0.0
    best_p, cp = None, 0.0
    for j in range(len(final) - 1):
        if final[j].section_idx != final[j + 1].section_idx:
            continue
        c = _contain(r.toks, final[j].toks | final[j + 1].toks)
        if c > cp:
            best_p, cp = j, c
    if cs >= SINGLE_STRONG:
        return (best_s,), cs
    if best_p is not None and cp >= PAIR_MIN and cp > cs:
        return (best_p, best_p + 1), cp
    if cs >= SINGLE_MIN:
        return (best_s,), cs
    return None, max(cs, cp)


def _rescue(unaligned: list[Sent], final: list[Sent]) -> dict[int, tuple[tuple[int, ...] | None, float]]:
    """Embedding alignment for lexically unaligned reference sentences (keyed by id of the Sent), same section only."""
    cands: dict[int, list[tuple[int, ...]]] = {}
    texts: dict[str, None] = {}
    for r in unaligned:
        cs = []
        for j, f in enumerate(final):
            if f.section_idx == r.section_idx:
                cs.append((j,))
                if j + 1 < len(final) and final[j + 1].section_idx == r.section_idx:
                    cs.append((j, j + 1))
        cands[id(r)] = cs
        texts[r.text] = None
        for c in cs:
            texts[" ".join(final[j].text for j in c)] = None
    out: dict[int, tuple[tuple[int, ...] | None, float]] = {}
    if not texts:
        return {id(r): (None, 0.0) for r in unaligned}
    names = list(texts)
    vec = dict(zip(names, guards._embed(names)))
    for r in unaligned:
        best, score = None, 0.0
        for c in cands[id(r)]:
            s = guards._cos(vec[r.text], vec[" ".join(final[j].text for j in c)])
            if s > score:
                best, score = c, s
        out[id(r)] = (best, score) if score >= EMBED_ALIGN else (None, score)
    return out


def _delta(label: str, ref: frozenset[str], fin: frozenset[str]) -> str:
    parts = []
    if ref - fin:
        parts.append("removed " + ", ".join(sorted(ref - fin)))
    if fin - ref:
        parts.append("added " + ", ".join(sorted(fin - ref)))
    return f"{label}: " + "; ".join(parts) if parts else ""


def check_claims(draft_md: str, final_md: str) -> list[dict]:
    """Findings, each {section, claim, verdict ("changed" | "missing"), dimension, reason, evidence}. Empty = nothing found.
    May call the gateway embedder (one batch) when a reference sentence has no lexical counterpart."""
    ref, final = prose_sentences(draft_md), prose_sentences(final_md)
    findings: list[dict] = []
    align: dict[int, tuple[int, ...] | None] = {}
    weak = []
    for i, r in enumerate(ref):
        if len(r.toks) < MIN_FEATURE_TOKENS:
            continue
        cand, _ = _lexical(r, final) if final else (None, 0.0)
        if cand is None:
            weak.append(r)
        else:
            align[i] = cand
    rescued = _rescue(weak, final) if weak and final else {}
    groups: dict[int, dict] = {}
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, r in enumerate(ref):
        if len(r.toks) < MIN_FEATURE_TOKENS:
            continue
        cand = align.get(i) or rescued.get(id(r), (None, 0.0))[0]
        if cand is None:
            if len(r.toks) >= MIN_REMOVED_TOKENS:
                findings.append({"section": r.section, "claim": r.text, "verdict": "missing", "dimension": "removed sentence",
                                 "reason": "reference sentence has no counterpart in the final", "evidence": ""})
            continue
        find(cand[0])
        for j in cand[1:]:
            parent[find(j)] = find(cand[0])
        groups.setdefault(i, {})["cand"] = cand
    members: dict[int, list[int]] = {}
    for i, g in groups.items():
        members.setdefault(find(g["cand"][0]), []).append(i)
    for root, idxs in members.items():
        fin_ids = sorted(k for k in parent if find(k) == root)
        rs = [ref[i] for i in idxs]
        fs = [final[j] for j in fin_ids]
        fr = features([s.text for s in rs])
        ff = features([s.text for s in fs])
        for key in ("numbers", "negations", "modality"):
            if fr[key] != ff[key]:
                findings.append({"section": rs[0].section, "claim": " ".join(s.text for s in rs), "verdict": "changed", "dimension": key,
                                 "reason": _delta(key, fr[key], ff[key]), "evidence": " ".join(s.text for s in fs)})
    return findings
