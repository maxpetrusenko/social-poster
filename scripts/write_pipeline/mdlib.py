"""Small deterministic text helpers shared by validators and guards. Reuses the evaluator's markdown parse for links."""
from __future__ import annotations

import re
from collections import Counter

from scripts.fingerprint_eval.refs import find_refs
from scripts.fingerprint_eval.textutil import parse_blocks, split_sentences

H1 = re.compile(r"^# (?!#)(.+?)\s*$")
H3 = re.compile(r"^### (?!#)(.+?)\s*$")
NUM_RE = re.compile(r"[$€£]?\d[\d,]*(?:\.\d+)?%?")
PLACEHOLDER = re.compile(r"\b(?:TODO|TBD|FIXME|lorem ipsum|XXX)\b|\[(?:INSERT|PLACEHOLDER|LINK|URL|CITATION|TODO)[^\]]*\](?!\()|<placeholder[^>]*>|\{\{[^}]*\}\}", re.I)
_BRACKET = re.compile(r"(?<!!)\[[^\]\n]+\](?!\(|\[|:)")  # bracketed text with no URL after it
_REAL_LINK = re.compile(r"(?<!!)\[[^\]\n]+\]\(\s*(?:(?:https?://|mailto:)[^\s)]+|[/#][^\s)]*)\s*\)", re.I)
_EMPTY_LINK = re.compile(r"\[[^\]\n]*\]\(\s*(?:#?\s*|(?:TODO|TBD|URL|link|placeholder)[^)]*)\)", re.I)


def find_placeholder(md: str) -> str | None:
    """The first true placeholder in `md`, or None. A markdown link with a real URL is never one, whatever its label ([LinkedIn], [Link])."""
    plain = _REAL_LINK.sub(lambda m: " ", md)
    m = PLACEHOLDER.search(plain) or _EMPTY_LINK.search(plain)
    if m:
        return m.group(0)
    for b in _BRACKET.finditer(plain):
        inner = b.group(0)[1:-1].strip()
        if len(inner) >= 3 and not re.fullmatch(r"[\d,\s.\-–]+|sic|\.{2,}|…", inner, re.I) and not inner.startswith("^"):
            return b.group(0)  # bracketed text that links nowhere
    return None
# first person experience claims. Allowed only when the source manifest holds author-supplied material.
EXPERIENCE = re.compile(
    r"\b(?:I (?:tested|tried|built|shipped|ran|measured|migrated|spent|worked|used|switched|wrote|deployed|saw|watched|interviewed)"
    r"|in my experience|when I |my team (?:and I )?|I've (?:been|seen|built|used|run)|we (?:tested|built|shipped|ran|measured) )", re.I)
URL_RE = re.compile(r"https?://[^\s)>\]\"']+")


def blocks(md: str):
    return parse_blocks(md)


def strip_code(md: str) -> str:
    """Remove fenced code blocks and inline code so lint and number checks read prose only."""
    out, fence = [], False
    for ln in md.split("\n"):
        if ln.lstrip().startswith("```"):
            fence = not fence
            continue
        if not fence:
            out.append(re.sub(r"`[^`\n]*`", "", ln))
    return "\n".join(out)


def link_urls(md: str) -> list[str]:
    """Canonical http(s) targets of every link (inline, reference, autolink, bare), code excluded."""
    urls = []
    for item in find_refs(md)["links"]:
        m = re.match(r"\[.*\]\((.*)\)$", item, re.S) or re.match(r"<(.*)>$", item) or re.match(r"(.*)", item)
        u = (m.group(1) if m else item).strip()
        if u.startswith(("http://", "https://", "www.")):
            urls.append(u.rstrip("/"))
    return urls


def image_refs(md: str) -> list[str]:
    return find_refs(md)["images"]


def prose_for_numbers(md: str) -> str:
    t = strip_code(md)
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", t)  # keep link text, drop the URL (digits in URLs are not claims)
    t = URL_RE.sub("", t)
    return t


def significant_numbers(md: str) -> Counter:
    """Multiset of numeric tokens that carry a claim: two or more digits, a percent, currency or a decimal."""
    c: Counter = Counter()
    for m in NUM_RE.findall(prose_for_numbers(md)):
        tok = m.rstrip(".,")
        digits = re.sub(r"\D", "", tok)
        if len(digits) >= 2 or "%" in tok or "." in tok or tok[0] in "$€£":
            c[tok.replace(",", "")] += 1
    return c


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def sentences(md: str) -> list[str]:
    out = []
    for b in parse_blocks(md):
        if b.kind == "paragraph":
            out.extend(split_sentences(b.text))
    return out


def title_subtitle(md: str) -> tuple[str | None, str | None, int]:
    """(title, subtitle, index of the first body line). The subtitle must be an H3 on the line right after the title."""
    lines = md.split("\n")
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i >= len(lines) or not H1.match(lines[i]):
        return None, None, 0
    title = H1.match(lines[i]).group(1)
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j < len(lines) and H3.match(lines[j]):
        return title, H3.match(lines[j]).group(1), j + 1
    return title, None, i + 1


def body_without_frame(md: str) -> str:
    """The article body: title, subtitle and any image blocks directly under them removed."""
    t, s, k = title_subtitle(md)
    lines = md.split("\n")[k:] if t else md.split("\n")
    return "\n".join(lines).strip("\n") + "\n"


def lint_v6(md: str) -> list[str]:
    """Hard structural rules of the V6 contract that need no judgement."""
    out = []
    if sum(1 for ln in md.split("\n") if ln.lstrip().startswith("```")) % 2:
        out.append("unclosed code fence")
    prose = strip_code(md)
    if re.search(r"^\s*\|.*\|\s*$", prose, re.M) and re.search(r"^\s*\|?\s*:?-{3,}", prose, re.M):
        out.append("table present (V6 forbids tables)")
    if "—" in prose:
        out.append("em dash in prose (V6)")
    m = find_placeholder(strip_code(md))
    if m:
        out.append(f"placeholder left in text: {m[:40]!r}")
    return out
