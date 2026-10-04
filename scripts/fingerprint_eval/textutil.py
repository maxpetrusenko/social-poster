"""Markdown block parsing, prose extraction, tokenization, corpus loaders."""
from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

IMAGE_RE = re.compile(r"^\s*!\[[^\]]*\]\([^)]*\)\s*$")
LINK_RE = re.compile(r"(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
LIST_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
SENT_SPLIT_RE = re.compile(r"(?<=[.!?])[\"')\]]*\s+(?=[\"'(\[]?[A-Z0-9])")


@dataclass
class Block:
    kind: str  # heading | image | code | paragraph | list | quote | table | rule
    text: str


def parse_blocks(md: str) -> list[Block]:
    """Split markdown into blocks. Code fences and image lines stay intact."""
    blocks: list[Block] = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    buf: list[str] = []

    def flush() -> None:
        if buf:
            text = "\n".join(buf).strip("\n")
            if text.strip():
                first = text.lstrip().split("\n", 1)[0]
                if all(ln.strip().startswith("|") for ln in text.split("\n")) and len(text.split("\n")) >= 2:
                    kind = "table"
                elif LIST_RE.match(first):
                    kind = "list"
                elif first.lstrip().startswith(">"):
                    kind = "quote"
                else:
                    kind = "paragraph"
                blocks.append(Block(kind, text))
            buf.clear()

    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            flush()
            fence = [line]
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                fence.append(lines[i])
                i += 1
            if i < len(lines):
                fence.append(lines[i])
            blocks.append(Block("code", "\n".join(fence)))
        elif not line.strip():
            flush()
        elif HEADING_RE.match(line):
            flush()
            blocks.append(Block("heading", line.strip()))
        elif IMAGE_RE.match(line):
            flush()
            blocks.append(Block("image", line.strip()))
        elif re.match(r"^\s*([-*_])\1{2,}\s*$", line):
            flush()
            blocks.append(Block("rule", line.strip()))
        else:
            buf.append(line)
        i += 1
    flush()
    return blocks


def render_blocks(blocks: list[Block]) -> str:
    return "\n\n".join(b.text for b in blocks) + "\n"


def strip_inline(text: str) -> str:
    """Drop link URLs, emphasis marks, inline code ticks."""
    text = LINK_RE.sub(r"\1", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1", r"\2", text)
    return text


def prose_paragraphs(md: str) -> list[str]:
    """Paragraph-kind blocks only, with inline markup stripped."""
    return [strip_inline(b.text).replace("\n", " ").strip() for b in parse_blocks(md) if b.kind == "paragraph"]


def list_items(md: str) -> list[str]:
    out: list[str] = []
    for b in parse_blocks(md):
        if b.kind == "list":
            for ln in b.text.split("\n"):
                if LIST_RE.match(ln):
                    out.append(strip_inline(LIST_RE.sub("", ln)).strip())
    return out


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    return [s for s in SENT_SPLIT_RE.split(text) if s.strip()]


def words(text: str) -> list[str]:
    return [w.lower() for w in WORD_RE.findall(text.replace("’", "'"))]


def body_text(md: str) -> str:
    """Prose + list items as plain text (what style metrics measure)."""
    parts: list[str] = []
    for b in parse_blocks(md):
        if b.kind in ("paragraph", "quote"):
            parts.append(strip_inline(b.text).replace("\n", " ").lstrip("> ").strip())
        elif b.kind == "list":
            parts.extend(list_items(b.text))
    return "\n\n".join(parts)


class _HTMLToText(HTMLParser):
    BLOCK = {"p", "h1", "h2", "h3", "h4", "li", "blockquote", "figcaption", "pre"}

    def __init__(self) -> None:
        super().__init__()
        self.out: list[str] = []
        self.cur: list[str] = []
        self.skip = 0
        self.prefix = ""

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script", "header", "footer"):
            self.skip += 1
        if tag in self.BLOCK:
            self._flush()
            self.prefix = {"h1": "# ", "h2": "## ", "h3": "## ", "h4": "### ", "li": "- ", "blockquote": "> "}.get(tag, "")

    def handle_endtag(self, tag):
        if tag in ("style", "script", "header", "footer"):
            self.skip = max(0, self.skip - 1)
        if tag in self.BLOCK:
            self._flush()

    def handle_data(self, data):
        if not self.skip:
            self.cur.append(data)

    def _flush(self):
        t = re.sub(r"\s+", " ", "".join(self.cur)).strip()
        if t:
            self.out.append(self.prefix + t)
        self.cur, self.prefix = [], ""


def html_to_text(html: str) -> str:
    m = re.search(r'<section data-field="body"[^>]*>(.*?)</section>\s*</article>', html, re.S)
    p = _HTMLToText()
    p.feed(m.group(1) if m else html)
    p._flush()
    chunks: list[str] = []
    for line in p.out:
        if line.startswith("- ") and chunks and chunks[-1].startswith("- "):
            chunks[-1] += "\n" + line
        else:
            chunks.append(line)
    return "\n\n".join(chunks)


def load_author_corpus(directory: Path, before: str = "2023-01-01", min_words: int = 150) -> list[tuple[str, str]]:
    """Pre-ChatGPT export posts only (filename date < before). Skips short comments."""
    out: list[tuple[str, str]] = []
    for f in sorted(directory.glob("*.html")):
        if f.name[:10] >= before or not re.match(r"\d{4}-\d{2}-\d{2}", f.name):
            continue
        t = html_to_text(f.read_text(errors="ignore"))
        if len(words(t)) >= min_words:
            out.append((f.name, t))
    return out


def load_pipeline_corpus(directory: Path, exclude: str | None = None) -> list[tuple[str, str]]:
    """Latest article-vN.md (raw markdown) from each cached article dir."""
    out: list[tuple[str, str]] = []
    for d in sorted(directory.iterdir()):
        if not d.is_dir() or d.name.startswith("_blocked") or d.name == exclude:
            continue
        vs = sorted(d.glob("article-v*.md"), key=lambda p: int(re.sub(r"\D", "", p.stem) or 0))
        if vs:
            out.append((d.name, vs[-1].read_text()))
    return out


def core_markdown(md: str) -> str:
    """Drop boilerplate sections (About the author, sources) before measuring style."""
    out: list[Block] = []
    skip = False
    for b in parse_blocks(md):
        if b.kind == "heading":
            m = HEADING_RE.match(b.text)
            skip = len(m.group(1)) >= 2 and bool(re.search(r"about the author|sources?\b|references|further reading", m.group(2), re.I))
        if not skip:
            out.append(b)
    return render_blocks(out)
