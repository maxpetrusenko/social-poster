"""Proposition-regeneration rewrite (own implementation of the reweave idea).

1. Split the article into frozen blocks (headings, images, code, lists, quotes,
   short or boilerplate sections) and prose segments.
2. Extract atomic propositions per prose segment as JSON; the source wording is
   then discarded.
3. Regenerate each segment from its propositions only, with a rewriter from a
   different model family than the original writer.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .gateway import GatewayError, Model, chat, extract_json
from .textutil import HEADING_RE, LINK_RE, Block, parse_blocks, render_blocks, split_sentences, words

FROZEN_KINDS = {"heading", "image", "code", "rule", "list", "quote", "table"}
BOILERPLATE_HEAD = re.compile(r"about the author|sources?\b|references|further reading", re.I)
PROMO_LINE = re.compile(r"^\s*(?:read next|read more|for a useful next read|related reading|further reading|up next)\b", re.I)  # "Read next: [title](url)" carries no claim
MEDIUM_PROFILE = re.compile(r"medium\.com/@", re.I)  # the author bio links the Medium profile
FOOTER_MAX_BLOCKS = 8
MIN_SEGMENT_WORDS = 12
EXTRACTOR = "claude:sonnet"  # fast; qwen3:8b works but takes ~3.5 min per segment (hidden reasoning)


class FamilyError(ValueError):
    pass


def assert_different_family(writer_family: str, rewriter_family: str) -> None:
    """Self-preference guard: rewriter must not share the writer's model family."""
    if not writer_family or not rewriter_family:
        raise FamilyError("writer_family and rewriter_family are required")
    if "unknown" in (writer_family, rewriter_family):
        raise FamilyError(f"unknown family ({writer_family!r} vs {rewriter_family!r}); refuse to guess")
    if writer_family.lower() == rewriter_family.lower():
        raise FamilyError(f"writer_family == rewriter_family == {writer_family!r}; use a different family")


def assert_same_family(writer_family: str, rewriter_family: str) -> None:
    """Control lane (A->A): the rewriter must be the writer's own known family, else it is not a control."""
    if not writer_family or not rewriter_family or "unknown" in (writer_family, rewriter_family):
        raise FamilyError(f"control needs known families ({writer_family!r} vs {rewriter_family!r})")
    if writer_family.lower() != rewriter_family.lower():
        raise FamilyError(f"control rewriter family {rewriter_family!r} != writer family {writer_family!r}; a control is same-family")


@dataclass
class Segment:
    idx: int
    section: str            # heading text of the enclosing section ("" = intro)
    section_idx: int
    blocks: list[Block]
    frozen: bool = False
    propositions: list[dict] = field(default_factory=list)
    output: str = ""
    role: str = ""
    nonfactual: list[int] = field(default_factory=list)  # 1-based sentence ids the extractor confirmed carry no factual claim

    @property
    def text(self) -> str:
        return "\n\n".join(b.text for b in self.blocks)


def footer_start(blocks: list[Block]) -> int | None:
    """Index of the rule block that opens the article footer (Read next line, author bio, sharing line, disclosure), or None.
    The footer is the first horizontal rule followed only by plain paragraphs and rules (at most FOOTER_MAX_BLOCKS), at least one
    of which is a linked "Read next" line or a paragraph linking the author's Medium profile. Everything from there on is frozen boilerplate."""
    for i, b in enumerate(blocks):
        if b.kind != "rule":
            continue
        rest = blocks[i + 1:]
        if not rest or len(rest) > FOOTER_MAX_BLOCKS or any(x.kind not in ("paragraph", "rule") for x in rest):
            continue
        if any(x.kind == "paragraph" and ((PROMO_LINE.match(x.text) and links_in(x.text)) or MEDIUM_PROFILE.search(x.text)) for x in rest):
            return i
    return None


def segment_article(md: str) -> list[Segment]:
    """Ordered segments; frozen ones are emitted verbatim."""
    segs: list[Segment] = []
    section, sec_idx, boiler = "", 0, False
    run: list[Block] = []
    all_blocks = parse_blocks(md)
    foot = footer_start(all_blocks)

    def flush_run():
        if run:
            seg = Segment(len(segs), section, sec_idx, list(run))
            if boiler or len(words(seg.text)) < MIN_SEGMENT_WORDS or (PROMO_LINE.match(seg.text) and links_in(seg.text)):
                seg.frozen = True
            segs.append(seg)
            run.clear()

    for n, b in enumerate(all_blocks):
        if n == foot:
            flush_run()
            boiler = True  # footer boilerplate: no claims extracted, compared byte-exact
        if b.kind == "heading":
            flush_run()
            m = HEADING_RE.match(b.text)
            if len(m.group(1)) >= 2:
                sec_idx += 1
                section, boiler = m.group(2), bool(BOILERPLATE_HEAD.search(m.group(2)))
            segs.append(Segment(len(segs), section, sec_idx, [b], frozen=True))
        elif b.kind in FROZEN_KINDS:
            flush_run()
            segs.append(Segment(len(segs), section, sec_idx, [b], frozen=True))
        else:
            run.append(b)
    flush_run()
    return segs


def links_in(text: str) -> list[str]:
    return [m.group(0) for m in LINK_RE.finditer(text)]


EXTRACT_PROMPT = """/no_think
Extract the atomic factual propositions from the passage below. One proposition = one self-contained claim, in plain neutral words (do not copy the passage's phrasing; keep names, numbers, units, and causal direction exact). Keep the order of the passage.
Keep hedges, certainty words and quantifiers verbatim inside the claim text (may, might, could, likely, partly, some, many, most, all, always, never, often, rarely, suggests, shows, proves, appears, about, nearly, at least, up to, only): "X might cause Y" must never become "X causes Y", and "suggests" must never become "shows".
Skip statements about the passage or article itself (transitions such as "the passage moves on", "this section explains"). Extract only claims about the world, people, studies, events, or the author's stated opinions.
If a claim came from a sentence containing a markdown link, copy that link into the proposition's "links" list exactly as written.
Every proposition carries "sentence_ids": the numbers of the numbered sentences below it was drawn from. Every factual sentence must be the source of at least one proposition.
Return ONLY JSON: {{"role": "<what this passage does, max 8 words>", "propositions": [{{"claim": "...", "links": [], "sentence_ids": [1]}}]}}

Section: {section}
Numbered sentences:
{numbered}

Passage:
{text}
"""


META_CLAIM_RE = re.compile(
    r"^\s*(?:the|this|that)\s+(?:passage|section|article|text|paragraph|piece|essay)(?:'s\s+[\w-]+(?:\s+section)?)?\s+"
    r"(?:moves|shifts|turns|transitions|continues|returns|pivots|zooms|steps)\b", re.I)


def is_meta_claim(claim: str) -> bool:
    """Discourse claims about the text itself carry no fact; judging them only produces false gate failures."""
    return bool(META_CLAIM_RE.match(claim))


def segment_sentences(seg: Segment) -> list[str]:
    """The numbered sentences of a prose segment (raw markdown, so links survive); ids in sentence_ids are 1-based into this list."""
    return [s for b in seg.blocks for s in split_sentences(b.text.replace("\n", " "))]


def numbered(sentences: list[str]) -> str:
    return "\n".join(f"[{i}] {s}" for i, s in enumerate(sentences, 1))


def parse_extraction(data, n_sentences: int) -> tuple[str, list[dict]]:
    """Strict: propositions is a list; sentence_ids, when present, is a list of in-range ints (bool rejected). Meta claims dropped."""
    if not isinstance(data, dict) or not isinstance(data.get("propositions", []), list):
        raise GatewayError("propositions is not a list")
    props = []
    for p in data.get("propositions", []):
        if not isinstance(p, dict) or not p.get("claim") or is_meta_claim(str(p["claim"])):
            continue
        ids = p.get("sentence_ids", [])
        if not isinstance(ids, list) or any(isinstance(i, bool) or not isinstance(i, int) or not 1 <= i <= n_sentences for i in ids):
            raise GatewayError(f"bad sentence_ids {str(ids)[:60]}")
        props.append({"claim": str(p["claim"]).strip(), "links": [l for l in p.get("links", []) if isinstance(l, str)], "sentence_ids": sorted(set(ids))})
    if not props:
        raise GatewayError("empty propositions")
    return str(data.get("role", ""))[:80], props


def request_extraction(sentences: list[str], section: str, model: str = EXTRACTOR, text: str | None = None) -> tuple[str, list[dict]]:
    """One extraction call (two attempts) over the given numbered sentences. Raises GatewayError with a category."""
    from .gateway import resolve_model
    m = resolve_model(model)
    last: Exception | None = None
    prompt = EXTRACT_PROMPT.format(section=section or "(intro)", numbered=numbered(sentences), text=text if text is not None else " ".join(sentences))
    for _ in range(2):
        try:
            return parse_extraction(extract_json(m.complete(prompt, **({"temperature": 0.1, "max_tokens": 6000} if m.backend == "gateway" else {}))), len(sentences))
        except (GatewayError, AttributeError, TypeError) as e:
            last = e
    from .contracts import Category
    cat = getattr(last, "category", Category.UNKNOWN_ERROR)
    raise GatewayError(f"extraction failed: {last}", Category.MALFORMED_MODEL_OUTPUT if cat is Category.UNKNOWN_ERROR else cat, getattr(last, "dependency", None))


def extract_propositions(seg: Segment, model: str = EXTRACTOR) -> None:
    try:
        role, props = request_extraction(segment_sentences(seg), seg.section, model, seg.text)
    except GatewayError as e:
        raise GatewayError(f"extraction failed for segment {seg.idx}: {e}", getattr(e, "category", None), getattr(e, "dependency", None)) from None
    seg.role, seg.propositions = role, props
    _attach_missing_links(seg)


def _attach_missing_links(seg: Segment) -> None:
    """Deterministic: every link of the source segment must ride on some proposition."""
    have = {l for p in seg.propositions for l in p["links"]}
    for sent in (s for b in seg.blocks for s in split_sentences(b.text)):
        for link in links_in(sent):
            if link in have:
                continue
            sw = set(words(LINK_RE.sub(r"\1", sent)))
            best = max(seg.propositions, key=lambda p: len(sw & set(words(p["claim"]))))
            best["links"].append(link)
            have.add(link)


STYLE_BRIEF = (
    "Voice: plain, concrete, first-hand. Vary sentence length (some long, some very short). "
    "No em dashes. No 'it isn't X, it's Y' or 'not X but Y' constructions. No rhetorical question followed by its own answer. "
    "No stock words like landscape, crucial, delve, testament, unlock. No summary sentence at the end of a paragraph."
)

REGEN_PROMPT = """/no_think
Write the prose for one part of an article, using ONLY the propositions below. Do not add facts, numbers, names, or claims. Do not drop any proposition. Keep their order unless two belong together.
Every markdown link in a proposition's "links" must appear in your text exactly as written, attached to the sentence that states that claim.
{style}
Length: about {n_words} words. Write {n_paras} paragraph(s) separated by blank lines. Output only the prose: no heading, no preamble, no bullet points.

Section: {section}
Passage role: {role}
Previous text ended with: {tail}
Propositions (JSON):
{props}
{extra}"""


def _clean(out: str) -> str:
    out = re.sub(r"^```\w*\s*|\s*```$", "", out.strip(), flags=re.M)
    lines = [l for l in out.split("\n") if not HEADING_RE.match(l)]
    text = "\n".join(lines).strip()
    text = re.sub(r"^(?:here(?:'s| is)[^\n]*:\s*\n+)", "", text, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def regenerate_segment(seg: Segment, rewriter: Model, tail: str, role: str = "") -> str:
    import json as _json

    n_words = len(words(seg.text))
    n_paras = max(1, len(seg.blocks))
    need = links_in(seg.text)
    extra = ""
    out = ""
    for attempt in range(2):
        prompt = REGEN_PROMPT.format(
            style=STYLE_BRIEF, n_words=n_words, n_paras=n_paras, section=seg.section or "(intro)", role=role or "-",
            tail=tail[-200:] or "(start of article)", props=_json.dumps(seg.propositions, ensure_ascii=False), extra=extra,
        )
        out = _clean(rewriter.complete(prompt, temperature=0.7, max_tokens=6000) if rewriter.backend == "gateway" else rewriter.complete(prompt))
        missing = [l for l in need if l not in out]
        if out and not missing:
            return out
        extra = "\nYour previous attempt omitted these links; include each exactly as written: " + " ".join(missing)
    return out  # guards will flag residual link loss


def rewrite_article(md: str, rewriter: Model, writer_family: str, segments: list[Segment], control: bool = False) -> str:
    """Rebuild the article: frozen segments verbatim, prose segments regenerated."""
    if control:  # same-family only allowed for the explicitly labeled eval control lane, and it must really be same-family
        assert_same_family(writer_family, rewriter.family)
    else:
        assert_different_family(writer_family, rewriter.family)
    parts: list[str] = []
    tail = ""
    for seg in segments:
        if seg.frozen or not seg.propositions:
            parts.append(seg.text)
            continue
        seg.output = regenerate_segment(seg, rewriter, tail, seg.role)
        parts.append(seg.output)
        tail = seg.output
    return "\n\n".join(parts) + "\n"
