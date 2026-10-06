"""Declared rewrites of link-bearing sentences in a repair.

A repair may reword a sentence that carries a link when the link survives. The rewrite has to be declared: the old sentence goes in the
report's `removals` with a `replacement` (the new wording, verbatim in the text). The checks, all deterministic and run before the claims gate:

1. every URL the old sentence carried is still carried by its replacement (link identity is the URL, as in linkpolicy);
2. the replacement is really in the text, word for word, and the old sentence is really gone (an undeclared edit is not a rewrite);
3. the replacement is support-checked like any added sentence (addcheck: numbers, names, negation, hedges, links) and must map to at least
   one evidence-ledger claim; the claims gate then judges it against the ledger evidence as an added sentence, because the declared old
   sentence leaves the reference it compares against (cuts.apply_cuts).
4. a link-bearing reference sentence that disappears or changes with NO declaration at all is a hard fail (an anchor-text-only change is not).
"""
from __future__ import annotations

import re
from collections import Counter

from scripts.fingerprint_eval.textutil import split_sentences

from . import addcheck as AC
from . import linkpolicy as LP
from . import mdlib as M
from .cuts import _key


_LINK = re.compile(r"(?<!!)\[[^\]\n]*\]\(\s*([^)\s]+)[^)]*\)")


def _anchorless(s: str) -> str:
    """The sentence with every link anchor replaced by its URL: an anchor-only change (policy rule 1, same URL) is not a rewrite."""
    return _key(_LINK.sub(lambda m: " " + m.group(1) + " ", s))


def _prose_sentences(md: str) -> list[str]:
    return [s for b in M.blocks(md) if b.kind == "paragraph" for s in split_sentences(b.text)]


def replacements(removals) -> dict[str, str]:
    """{old sentence key: declared replacement text} for the removals that carry a replacement."""
    return {_key(str(r.get("text", ""))): str(r["replacement"]).strip() for r in (removals or [])
            if isinstance(r, dict) and isinstance(r.get("replacement"), str) and r["replacement"].strip() and _key(str(r.get("text", "")))}


def rewrite_keys(removals) -> frozenset[str]:
    """Keys of the sentences declared as replacements: the added-sentence check lets them carry a softening word (see addcheck.WEAKENING)."""
    return frozenset(_key(s) for rep in replacements(removals).values() for s in split_sentences(rep))


def check_rewrites(ref: str, cand: str, removals, new_removals, *, ev: dict, blob: str, known_urls: set[str], blob_numbers, author_material: bool) -> list[str]:
    reasons: list[str] = []
    cand_keys = {_key(s) for s in _prose_sentences(cand)}
    cand_anchorless = {_anchorless(s) for s in _prose_sentences(cand)}
    ref_sents = _prose_sentences(ref)
    declared = {_key(str(r.get("text", ""))) for r in (removals or []) if isinstance(r, dict)}
    reps = replacements(new_removals)  # earlier rounds' rewrites were checked when accepted; their old sentences are already out of `ref`
    support = AC.support_sentences(ev, blob)
    ledger_support = AC.support_sentences(ev, "")
    vocab = AC.vocabulary(support, ref)
    old_urls = {_key(s): Counter(LP.urls(s)) for s in ref_sents}
    for old_key, rep in reps.items():
        if old_key not in old_urls:
            reasons.append(f"declared rewrite does not match a reference sentence exactly: {old_key[:80]!r}")
            continue
        if old_key in cand_keys:
            reasons.append(f"declared rewrite of {old_key[:60]!r}: the old sentence is still in the text")
        new_sents = split_sentences(rep)
        missing = [s for s in new_sents if _key(s) not in cand_keys]
        if not new_sents or missing:
            reasons.append(f"declared replacement is not in the text word for word: {(missing or [rep])[0][:100]!r}")
            continue
        lost = old_urls[old_key] - Counter(u for s in new_sents for u in LP.urls(s))
        if lost:
            reasons.append(f"rewrite of {old_key[:60]!r} loses link(s) {sorted(lost)[:3]}: a rewritten sentence must keep every URL it carried")
        for s in new_sents:
            why = AC.check_sentence(s, ev=ev, support=support, known_urls=known_urls, blob_numbers=blob_numbers, author_material=author_material, vocab=vocab, weak_ok=AC.WEAKENING)
            if why:
                reasons.append(f"replacement rejected {s[:100]!r}: " + "; ".join(why))
            elif not AC._matches(s, ledger_support):
                reasons.append(f"replacement maps to no evidence-ledger claim: {s[:100]!r}")
    for s in ref_sents:  # rule 4: no silent edit of a sentence that carries a link
        k = _key(s)
        if LP.urls(s) and k not in cand_keys and k not in declared and _anchorless(s) not in cand_anchorless:
            reasons.append(f"link-bearing sentence changed or removed without a declaration: {s[:100]!r}; declare it in removals with its `replacement`")
    return reasons
