"""Images and links anywhere in markdown, read from a real CommonMark parse (markdown-it-py).

Covers inline, shortcut/collapsed/full reference links and images (resolved through their definitions: a link whose
definition is gone is plain text, so it counts as lost), autolinks, bare URLs, raw HTML <a>/<img>, in every block
(lists, quotes, GFM tables). Fenced/indented code and inline code spans are ignored (code is compared verbatim elsewhere).
Items are canonical strings: [text](href), ![alt](src), <autolink>, bare URL, <a href="..."> / <img src="...">.
"""
from __future__ import annotations

import re
from collections import Counter

from .textutil import html_tags, md_parser

LINK_INLINE = re.compile(r"\[[^\]]+\]\([^)]*\)")  # shape of a canonical inline-link item (repair.py fullmatches tokens against it)
BARE_URL = re.compile(r"(?<![\w/=@])(?:https?://|www\.)[^\s<>\[\]()\"']+", re.I)


def _walk_inline(children: list, images: list[str], links: list[str]) -> None:
    text_runs: list[str] = []  # text outside links, for bare URLs

    def flush() -> None:
        if text_runs:
            links.extend(m.group(0).rstrip(".,;:!?") for m in BARE_URL.finditer("".join(text_runs)))
            text_runs.clear()

    stack: list[tuple[str, str]] = []  # (href, markup) of open links
    label: list[list[str]] = []
    for k in children or []:
        t = k.type
        if t == "link_open":
            flush()
            stack.append((k.attrGet("href") or "", k.markup))
            label.append([])
        elif t == "link_close" and stack:
            href, markup = stack.pop()
            text = "".join(label.pop())
            links.append(f"<{href}>" if markup == "autolink" else f"[{text}]({href})")
            if label:
                label[-1].append(text)
        elif t == "image":
            images.append(f"![{k.content}]({k.attrGet('src') or ''})")
        elif t in ("text", "code_inline"):
            if label:
                label[-1].append(k.content)
            elif t == "text":
                text_runs.append(k.content)
            else:
                flush()
        elif t in ("softbreak", "hardbreak"):
            if label:
                label[-1].append(" ")
            else:
                text_runs.append(" ")
        elif t == "html_inline":
            flush()
            _html(k.content, images, links)
        else:
            flush()
    flush()


def _html(html: str, images: list[str], links: list[str]) -> None:
    for tag, url in html_tags(html).tags:
        if tag == "img":
            images.append(f'<img src="{url}">')
        else:
            links.append(f'<a href="{url}">')


def find_refs(md: str) -> dict[str, list[str]]:
    """{'images': [...], 'links': [...]} in document order."""
    images: list[str] = []
    links: list[str] = []
    for t in md_parser().parse(md.replace("\r\n", "\n")):
        if t.type == "inline":
            _walk_inline(t.children, images, links)
        elif t.type == "html_block":
            _html(t.content, images, links)
    return {"images": images, "links": links}


def lost(original: list[str], rewrite: list[str]) -> list[str]:
    """Items in `original` (multiset) that `rewrite` no longer has."""
    return list((Counter(original) - Counter(rewrite)).elements())


_LINK_TARGET = re.compile(r"\[.*\]\((.*)\)$|<a href=\"(.*)\">$|<(.*)>$", re.S)


def link_url(item: str) -> str:
    """Normalized URL of a canonical link item. Link identity is the URL: the anchor text is not part of it."""
    m = _LINK_TARGET.match(item)
    u = next((g for g in (m.groups() if m else (item,)) if g is not None), item).strip()
    from urllib.parse import urlsplit, urlunsplit
    try:
        p = urlsplit(u if "://" in u or not u.lower().startswith("www.") else "https://" + u)
        if p.scheme and p.netloc:
            return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), p.query, "")).rstrip("/")
    except ValueError:
        pass
    return u.rstrip("/")


def lost_urls(original: list[str], rewrite: list[str], allowed: "Counter[str] | set[str] | None" = None) -> list[str]:
    """Canonical items of `original` whose URL (multiset) `rewrite` no longer has, minus URLs in `allowed` (declared removals)."""
    gone = Counter(map(link_url, original)) - Counter(map(link_url, rewrite))
    if allowed:
        gone -= Counter({u: 1_000_000 for u in allowed}) if not isinstance(allowed, Counter) else allowed
    out = []
    for it in original:
        u = link_url(it)
        if gone.get(u, 0) > 0:
            gone[u] -= 1
            out.append(it)
    return out
