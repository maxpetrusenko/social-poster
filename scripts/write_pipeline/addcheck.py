"""Sentences an editorial repair adds, each evaluated on its own.

Deterministic half (no model): numbers, links, invented first-person experience, negation and hedge/certainty terms against the evidence
and the source text. The evaluator's added-claim support check (`fingerprint_eval.added.check_added`, run inside the claims gate with the
source notes and the evidence ledger bound in by `gaterun`) is the semantic half. A sentence is accepted only if both pass.
"""
from __future__ import annotations

import re

from scripts.fingerprint_eval import added as AD
from scripts.fingerprint_eval.claimcheck import modality
from scripts.fingerprint_eval.textutil import split_sentences

from . import mdlib as M

MATCH_MIN = 0.3   # content-token overlap that makes a ledger or source sentence "about the same thing"
MAX_MATCHES = 3
WEAKENING = frozenset({"only", "may", "might", "could", "possibly", "perhaps", "partly", "partially", "some", "few", "roughly", "approximately", "nearly", "almost",
                       "sometimes", "rarely", "seldom", "unlikely", "potentially", "largely", "mostly", "mainly"})  # narrowing or softening words a declared rewrite may add
_LINK_TARGET = re.compile(r"\]\([^)]*\)")


def added_sentences(ref: str, cand: str) -> list[tuple[str, str]]:
    """(section, sentence) for every prose sentence of `cand` that has no counterpart in `ref` (the evaluator's own new-sentence rule)."""
    return [(sec, s) for sec, ss in AD.new_sentences(ref, cand).items() for s in ss]


def support_sentences(ev: dict, blob: str) -> list[str]:
    """Everything a new sentence may lean on: supported/attributed/inference claims, their wording and passages, and the source text."""
    out: list[str] = []
    for c in ev.get("claims", []):
        if not isinstance(c, dict) or c.get("status") == "unresolved":
            continue
        for t in (c.get("claim"), c.get("supported_wording"), *[e.get("passage") for e in (c.get("evidence") or []) if isinstance(e, dict)]):
            if t:
                out += split_sentences(str(t))
    for para in re.split(r"\n\s*\n", blob):
        out += split_sentences(para.strip())
    return [s for s in out if s.strip()]


def _matches(sentence: str, support: list[str]) -> list[str]:
    st = AD._content_tokens(_LINK_TARGET.sub("]", sentence))  # a link's URL is not content: its pieces must not dilute the overlap
    if not st:
        return []
    scored = sorted(((len(st & AD._content_tokens(x)) / len(st), x) for x in support), key=lambda t: -t[0])
    return [x for sc, x in scored[:MAX_MATCHES] if sc >= MATCH_MIN]


def vocabulary(support: list[str], ref: str = "") -> frozenset[str]:
    """Every lowercase word of the evidence, the sources and the reference article: a name outside it is new."""
    return frozenset(w for t in (*support, ref) for w in AD.words(t))


def check_sentence(sentence: str, *, ev: dict, support: list[str], known_urls: set[str], blob_numbers, author_material: bool, vocab: frozenset[str] | None = None,
                   weak_ok: frozenset[str] = frozenset()) -> list[str]:
    reasons: list[str] = []
    if vocab is not None:  # named entities stay deterministic: a restatement may reword, it may not introduce a person, place or organisation
        ents = {e.replace("\u2019", "'") for e in AD._signature(sentence)[2]}
        new_ents = sorted(e for e in ents if len(e) >= 4 and e not in vocab and e.removesuffix("'s") not in vocab)
        if new_ents:
            reasons.append(f"name {new_ents[:3]} is not in the sources, the evidence or the article")
    bad_n = [k for k in M.significant_numbers(sentence) if k not in blob_numbers]
    if bad_n:
        reasons.append(f"number {sorted(bad_n)[:3]} is not in the sources or the evidence")
    bad_u = [u for u in M.link_urls(sentence) if u not in known_urls]
    if bad_u:
        reasons.append(f"link {bad_u[:2]} is not in the source or evidence set")
    if not author_material and M.EXPERIENCE.search(sentence):
        reasons.append("invented first-person experience (no author-supplied material)")
    near = _matches(sentence, support)
    _, negs, _ = AD._signature(sentence)
    if negs:
        known = set().union(*(AD._signature(x)[1] for x in near)) if near else set()
        if not negs <= known:
            reasons.append(f"negation {sorted(negs - known)[:3]} is not in any supporting sentence")
    hedges = modality(sentence) - weak_ok  # weak_ok: terms that only lower commitment, allowed in a declared rewrite (the claims gate still judges it)
    if hedges and near:
        known_m = set().union(*(modality(x) for x in near))
        if not hedges <= known_m:
            reasons.append(f"hedge or certainty term {sorted(hedges - known_m)[:3]} is stronger or different than the supporting text")
    return reasons


def check_added(ref: str, cand: str, *, ev: dict, blob: str, known_urls: set[str], blob_numbers, author_material: bool, rewrite_keys: frozenset[str] = frozenset()) -> list[dict]:
    """[{section, sentence, reasons}] for each added sentence that fails a deterministic check. Empty = none failed here."""
    support = support_sentences(ev, blob)
    vocab = vocabulary(support, ref)
    bad = []
    for sec, s in added_sentences(ref, cand):
        from .cuts import _key
        r = check_sentence(s, ev=ev, support=support, known_urls=known_urls, blob_numbers=blob_numbers, author_material=author_material, vocab=vocab,
                           weak_ok=WEAKENING if _key(s) in rewrite_keys else frozenset())
        if r:
            bad.append({"section": sec, "sentence": s, "reasons": r})
    return bad
