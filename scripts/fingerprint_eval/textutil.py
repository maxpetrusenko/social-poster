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


_MD = None


def md_parser():
    """CommonMark parser (markdown-it-py, pinned in scripts/fingerprint_eval/requirements.txt) plus GFM tables and strikethrough."""
    global _MD
    if _MD is None:
        from markdown_it import MarkdownIt
        _MD = MarkdownIt("commonmark").enable(["table", "strikethrough"])
    return _MD


class _TagCollector(HTMLParser):
    """Raw HTML: the a/img tags it carries and whether any visible text remains."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, str]] = []  # ("a", href) / ("img", src)
        self.text = ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "a" and d.get("href"):
            self.tags.append(("a", d["href"]))
        elif tag == "img" and d.get("src"):
            self.tags.append(("img", d["src"]))

    handle_startendtag = handle_starttag

    def handle_data(self, data):
        self.text += data


def html_tags(html: str) -> _TagCollector:
    c = _TagCollector()
    try:
        c.feed(html)
        c.close()
    except Exception:  # noqa: BLE001  malformed HTML: whatever parsed so far is what counts
        pass
    return c


def _block_kind(tokens: list, i: int) -> tuple[str, int]:
    """(kind, index of the matching close token) for the top-level block opening at tokens[i]."""
    t = tokens[i]
    close = i
    if t.nesting == 1:
        close = next(j for j in range(i + 1, len(tokens)) if tokens[j].level == t.level and tokens[j].nesting == -1)
    kind = {"heading_open": "heading", "bullet_list_open": "list", "ordered_list_open": "list", "blockquote_open": "quote",
            "table_open": "table", "hr": "rule", "fence": "code", "code_block": "code", "html_block": "paragraph", "paragraph_open": "paragraph"}.get(t.type)
    if kind is None:
        kind = "paragraph"
    if t.type == "paragraph_open":
        kids = tokens[i + 1].children or []
        if kids and all(k.type == "image" or (k.type in ("text", "softbreak") and not k.content.strip()) for k in kids) and any(k.type == "image" for k in kids):
            kind = "image"
        elif kids and all(k.type == "html_inline" or (k.type in ("text", "softbreak") and not k.content.strip()) for k in kids):
            c = html_tags("".join(k.content for k in kids))
            if c.tags and not c.text.strip() and all(tag == "img" for tag, _ in c.tags):
                kind = "image"
    elif t.type == "html_block":
        c = html_tags(t.content)
        if c.tags and not c.text.strip() and all(tag == "img" for tag, _ in c.tags):
            kind = "image"
    return kind, close


def parse_blocks(md: str) -> list[Block]:
    """Top-level CommonMark blocks (GFM tables included) with their source text. Setext headings are normalised to ATX form."""
    md = md.replace("\r\n", "\n")
    lines = md.split("\n")
    tokens = md_parser().parse(md)
    blocks: list[Block] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.level != 0 or not t.map or t.nesting == -1:
            i += 1
            continue
        kind, close = _block_kind(tokens, i)
        start, end = t.map
        if kind == "heading":
            if t.markup in ("=", "-"):  # setext: the source is two lines; keep one ATX line
                text = "#" * int(t.tag[1]) + " " + tokens[i + 1].content.strip()
            else:
                text = lines[start].strip()
        else:
            text = "\n".join(lines[start:end]).strip("\n")
            if kind == "paragraph":
                text = text.strip()
        if text.strip():
            blocks.append(Block(kind, text))
        i = close + 1
    return blocks


def render_blocks(blocks: list[Block]) -> str:
    return "\n\n".join(b.text for b in blocks) + "\n"


REF_DEF_LINE_RE = re.compile(r"^ {0,3}\[[^\]]+\]:[ \t]*\S+.*$", re.M)  # definitions live at block level; inline parsing cannot resolve them
UNRESOLVED_REF_RE = re.compile(r"\[([^\]]+)\]\[[^\]]*\]")


def _inline_plain(children: list) -> str:
    out: list[str] = []
    for k in children or []:
        if k.type == "image":
            continue
        if k.type in ("text", "code_inline"):
            out.append(k.content)
        elif k.type in ("softbreak", "hardbreak"):
            out.append("\n")
        elif k.type == "html_inline":
            continue
    return "".join(out)


def strip_inline(text: str) -> str:
    """Plain text of inline markdown: link URLs, emphasis marks, code ticks, raw HTML tags and images dropped."""
    text = REF_DEF_LINE_RE.sub("", text)
    plain = "".join(_inline_plain(t.children) for t in md_parser().parseInline(text))
    return UNRESOLVED_REF_RE.sub(r"\1", plain).strip("\n")


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


PIPELINE_CORPUS_ENV = "FINGERPRINT_PIPELINE_CORPUS"
DEFAULT_PIPELINE_CORPUS = Path(".cache/fingerprint-eval/pipeline")


def resolve_pipeline_corpus(environ=None, repo: Path | None = None) -> Path | None:
    """The advisory pipeline-comparison corpus: env FINGERPRINT_PIPELINE_CORPUS, else <repo>/.cache/fingerprint-eval/pipeline when
    it exists, else None (the advisory comparison is skipped). Never derived from a package path: a package's parent can be an
    arbitrary directory (a Desktop) that takes minutes to scan."""
    import os
    environ = os.environ if environ is None else environ
    repo = repo or Path(__file__).resolve().parents[2]
    configured = (environ.get(PIPELINE_CORPUS_ENV) or "").strip()
    for cand in ([Path(configured).expanduser()] if configured else []) + [repo / DEFAULT_PIPELINE_CORPUS]:
        if cand.is_dir():
            return cand
    return None


DEFAULT_MAX_PARALLEL = 4


def max_parallel(environ=None) -> int:
    """FG_MAX_PARALLEL (default 4), clamped to 1..16; an unparsable value falls back to the default."""
    import os
    environ = os.environ if environ is None else environ
    try:
        return max(1, min(16, int(environ.get("FG_MAX_PARALLEL", DEFAULT_MAX_PARALLEL))))
    except (TypeError, ValueError):
        return DEFAULT_MAX_PARALLEL


def parallel_map(fn, items: list, workers: int | None = None) -> list:
    """[fn(x) for x in items] on a bounded thread pool. Results keep the input order. If any call raises, every call is still
    awaited (no orphan threads) and the exception of the EARLIEST failing item is re-raised, so a failure is deterministic and the
    caller stays fail-closed."""
    items = list(items)
    n = min(workers or max_parallel(), len(items))
    if n <= 1:
        return [fn(x) for x in items]
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=n) as pool:
        futures = [pool.submit(fn, x) for x in items]
        out, first = [], None
        for f in futures:
            try:
                out.append(f.result())
            except BaseException as e:  # noqa: BLE001  re-raised below
                first = first or e
        if first is not None:
            raise first
    return out
