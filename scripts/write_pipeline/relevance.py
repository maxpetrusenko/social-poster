"""Topical relevance for author-input suggestions. A suggestion that shares too few terms with the article's key entities is omitted:
a generic prompt ("add your own experience") is noise in a review package, and a suggestion about another subject is wrong."""
from __future__ import annotations

import re

from . import mdlib as M
from .validators import STOP

MIN_OVERLAP = 2          # distinct key terms the suggestion must share with the article
MIN_SHARE = 0.15         # and at least this share of the suggestion's own content terms
_WORD = re.compile(r"[a-z0-9][a-z0-9'-]*")
_GENERIC = frozenset("add your own please include share provide consider mention write about the article reader readers author experience first hand firsthand data note notes "
                     "supplied supplied would could should might make some more any need needs needed want like also with from have been that this what when where which".split())


def terms(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower().replace("’", "'")) if w not in STOP and w not in _GENERIC and (len(w) > 3 or w.isdigit())}


def key_terms(title: str | None, subtitle: str | None, body: str, claims: list[dict]) -> set[str]:
    """Key entities of the article: title, subtitle, headings and every research claim (wording and source ids)."""
    heads = " ".join(b.text.lstrip("# ").strip() for b in M.blocks(body) if b.kind == "heading")
    cl = " ".join(f"{c.get('claim', '')} {c.get('supported_wording', '')}" for c in claims if isinstance(c, dict))
    return terms(f"{title or ''} {subtitle or ''} {heads} {cl}")


def is_relevant(suggestion: str, key: set[str]) -> bool:
    t = terms(suggestion)
    hit = t & key
    return len(hit) >= MIN_OVERLAP and len(hit) / max(len(t), 1) >= MIN_SHARE


def filter_suggestions(items: list[str], key: set[str]) -> tuple[list[str], int]:
    """(kept, omitted count)."""
    kept = [x for x in items if is_relevant(x, key)]
    return kept, len(items) - len(kept)
