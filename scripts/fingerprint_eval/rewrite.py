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

FROZEN_KINDS = {"heading", "image", "code", "rule", "list", "quote"}
BOILERPLATE_HEAD = re.compile(r"about the author|sources?\b|references|further reading", re.I)
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

    @property
    def text(self) -> str:
        return "\n\n".join(b.text for b in self.blocks)


def segment_article(md: str) -> list[Segment]:
    """Ordered segments; frozen ones are emitted verbatim."""
    segs: list[Segment] = []
    section, sec_idx, boiler = "", 0, False
    run: list[Block] = []

    def flush_run():
        if run:
            seg = Segment(len(segs), section, sec_idx, list(run))
            if boiler or len(words(seg.text)) < MIN_SEGMENT_WORDS:
                seg.frozen = True
            segs.append(seg)
            run.clear()

    for b in parse_blocks(md):
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
If a claim came from a sentence containing a markdown link, copy that link into the proposition's "links" list exactly as written.
Return ONLY JSON: {{"role": "<what this passage does, max 8 words>", "propositions": [{{"claim": "...", "links": []}}]}}

Section: {section}
Passage:
{text}
"""


def extract_propositions(seg: Segment, model: str = EXTRACTOR) -> None:
    from .gateway import resolve_model
    m = resolve_model(model)
    last: Exception | None = None
    for _ in range(2):
        try:
            data = extract_json(m.complete(EXTRACT_PROMPT.format(section=seg.section or "(intro)", text=seg.text), **({"temperature": 0.1, "max_tokens": 6000} if m.backend == "gateway" else {})))
            props = [p for p in data.get("propositions", []) if isinstance(p, dict) and p.get("claim")]
            if not props:
                raise GatewayError("empty propositions")
            seg.role = str(data.get("role", ""))[:80]
            seg.propositions = [{"claim": str(p["claim"]).strip(), "links": [l for l in p.get("links", []) if isinstance(l, str)]} for p in props]
            _attach_missing_links(seg)
            return
        except (GatewayError, AttributeError, TypeError) as e:
            last = e
    raise GatewayError(f"extraction failed for segment {seg.idx}: {last}")


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
    if not control:  # same-family only allowed for the explicitly labeled eval control lane
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
