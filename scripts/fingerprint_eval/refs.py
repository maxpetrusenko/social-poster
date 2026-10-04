"""Images and links anywhere in markdown: inline, reference-style, autolinks, bare URLs.

Fenced code and inline code spans are ignored (code blocks are compared verbatim elsewhere).
"""
from __future__ import annotations

import re
from collections import Counter

from .textutil import parse_blocks

IMG_INLINE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
IMG_REF = re.compile(r"!\[[^\]]*\]\[[^\]]*\]")
LINK_INLINE = re.compile(r"\[[^\]]+\]\([^)]*\)")
LINK_REF = re.compile(r"\[[^\]]+\]\[[^\]]*\]")
REF_DEF = re.compile(r"^[ ]{0,3}\[[^\]]+\]:[ \t]*\S+[^\n]*$", re.M)
AUTOLINK = re.compile(r"<(?:https?://|mailto:)[^>\s]+>", re.I)
BARE_URL = re.compile(r"(?<![\w/=@])(?:https?://|www\.)[^\s<>\[\]()\"']+", re.I)
INLINE_CODE = re.compile(r"`[^`\n]*`")


def _scannable(md: str) -> str:
    text = "\n\n".join(b.text for b in parse_blocks(md) if b.kind != "code")
    return INLINE_CODE.sub(" ", text)


def _take(rx: re.Pattern, text: str, out: list[str]) -> str:
    """Collect matches in document order and blank them so later patterns don't re-match them."""
    out.extend(m.group(0).strip() for m in rx.finditer(text))
    return rx.sub(" ", text)


def find_refs(md: str) -> dict[str, list[str]]:
    """{'images': [...], 'links': [...]}; links = inline, reference, definitions, autolinks and bare URLs."""
    text = _scannable(md)
    images: list[str] = []
    links: list[str] = []
    for rx in (IMG_INLINE, IMG_REF):
        text = _take(rx, text, images)
    for rx in (LINK_INLINE, LINK_REF, REF_DEF, AUTOLINK):
        text = _take(rx, text, links)
    links.extend(m.group(0).rstrip(".,;:!?") for m in BARE_URL.finditer(text))
    return {"images": images, "links": links}


def lost(original: list[str], rewrite: list[str]) -> list[str]:
    """Items in `original` (multiset) that `rewrite` no longer has."""
    return list((Counter(original) - Counter(rewrite)).elements())
