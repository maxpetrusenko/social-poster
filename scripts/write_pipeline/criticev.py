"""What the independent critic sees of the evidence, and the deterministic rebuttal of its "unsupported" findings.

The critic used to get claim rows and URLs only, so a fact that lives in an evidence passage or in a captured source was reported as
"not in the ledger" (round 3 of the one-book run: 4 of 9 majors). `ledger_view` now shows each claim with its evidence passages and the
captured-source excerpts that bear on it, truncated per claim so the prompt stays bounded. `rebut` is the model-free backstop: an
"unsupported" major whose quoted passage or claim span is found verbatim (normalised) in a ledger evidence passage or a captured source
is downgraded to "rebutted", with a pointer to where it was found, and no longer counts against READY.
"""
from __future__ import annotations

import re
import unicodedata

from scripts.fingerprint_eval import added as AD

PASSAGES_PER_CLAIM = 3
PASSAGE_CAP = 600          # characters of one evidence passage shown to the critic
EXCERPTS_PER_CLAIM = 2
EXCERPT_CAP = 500          # characters of one captured-source excerpt shown per claim
EXCERPT_MIN_SCORE = 0.3    # share of the claim's content tokens an excerpt must contain
LEDGER_MAX_CHARS = 45000   # the whole ledger block
MIN_SPAN = 12              # normalised characters: a shorter span would match anything
UNSUPPORTED = re.compile(r"unsupported|not supported|no evidence|not in the (?:evidence |ledger|sources?)|not found in|ledger (?:has|carries|lacks)|does not support|isn.t supported", re.I)

Source = tuple[str, str]   # (captured file, its text)


def _cut(text: str, cap: int) -> str:
    t = " ".join(str(text).split())
    return t if len(t) <= cap else t[:cap].rstrip() + " ..."


def ledger_view(ev: dict, sources: list[Source]) -> str:
    """One block per claim: status, claim, URLs, its evidence passages, and the captured-source excerpts that bear on it."""
    chunks = [(f, c) for f, text in sources for c, _ in AD.notes_chunks(text)]
    toks = [AD._content_tokens(c) for _, c in chunks]
    rows: list[str] = []
    used = 0
    for n, c in enumerate(ev.get("claims", []), 1):
        if not isinstance(c, dict):
            continue
        evs = [e for e in (c.get("evidence") or []) if isinstance(e, dict)]
        urls = ", ".join(str(e.get("url") or e.get("source_id")) for e in evs)
        lines = [f"- [{c.get('status')}] {c.get('id') or f'c{n}'}: {c.get('claim')} ({urls})"]
        if c.get("supported_wording") and c.get("supported_wording") != c.get("claim"):
            lines.append(f"    supported wording: {_cut(c['supported_wording'], PASSAGE_CAP)}")
        shown: set[str] = set()
        for e in [e for e in evs if e.get("passage")][:PASSAGES_PER_CLAIM]:
            lines.append(f"    evidence passage ({e.get('url') or e.get('source_id')}): {_cut(e['passage'], PASSAGE_CAP)}")
            shown.add(_norm(str(e["passage"]))[:80])
        ct = AD._content_tokens(f"{c.get('claim', '')} {c.get('supported_wording', '')}")
        if ct and chunks:
            best = sorted(((len(ct & toks[i]) / len(ct), i) for i in range(len(chunks))), key=lambda t: (-t[0], t[1]))
            for sc, i in best[:EXCERPTS_PER_CLAIM]:
                if sc >= EXCERPT_MIN_SCORE and _norm(chunks[i][1])[:80] not in shown:
                    lines.append(f"    source excerpt ({chunks[i][0]}): {_cut(chunks[i][1], EXCERPT_CAP)}")
        block = "\n".join(lines)
        if used + len(block) > LEDGER_MAX_CHARS:
            rows.append("- (further claims omitted: ledger view truncated)")
            break
        rows.append(block)
        used += len(block)
    return "\n".join(rows) or "(none)"


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKC", str(t)).lower()
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = re.sub(r"[*_`>#]", " ", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    return " ".join(re.sub(r"[^\w$%.,']+", " ", t).split())


def _targets(ev: dict, sources: list[Source]) -> list[tuple[str, str]]:
    """(normalised text, pointer) of every ledger evidence passage and captured source."""
    out = []
    for n, c in enumerate(ev.get("claims", []), 1):
        if not isinstance(c, dict):
            continue
        for k, e in enumerate([e for e in (c.get("evidence") or []) if isinstance(e, dict) and e.get("passage")], 1):
            out.append((_norm(e["passage"]), f"ledger {c.get('id') or f'c{n}'} evidence passage {k} ({e.get('url') or e.get('source_id')})"))
    out += [(_norm(text), f"captured source {f}") for f, text in sources]
    return out


def _spans(f: dict) -> list[str]:
    """What the critic quoted, most specific first: its claim span, then the article passage and its sentences."""
    span = str(f.get("claim_span") or "")
    cands = [span if _norm(span) in _norm(f.get("passage") or "") else "", str(f.get("passage") or "")]  # a span that is not in the quoted article text is ignored
    cands += [s for s in re.split(r"(?<=[.!?])\s+", str(f.get("passage") or "")) if s]
    seen, out = set(), []
    for s in cands:
        n = _norm(s)
        if len(n) >= MIN_SPAN and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def is_unsupported(f: dict) -> bool:
    return f.get("kind") == "unsupported" or bool(UNSUPPORTED.search(str(f.get("reason", ""))))


def rebut(findings: list[dict], ev: dict, sources: list[Source]) -> list[dict]:
    """The same findings, each "unsupported" major whose quoted text occurs verbatim in a ledger evidence passage or a captured source
    marked severity "rebutted" (the original severity kept) with a `rebuttal` pointer. Everything else is returned untouched."""
    targets = _targets(ev, sources)
    out = []
    for f in findings:
        if f.get("severity") == "major" and f.get("verified") and is_unsupported(f):
            for span in _spans(f):
                hit = next((ptr for text, ptr in targets if span in text), None)
                if hit:
                    f = {**f, "original_severity": "major", "severity": "rebutted", "rebuttal": {"pointer": hit, "matched": span[:160]}}
                    break
        out.append(f)
    return out


# ---- required skill furniture -----------------------------------------------------------------------------------
REMOVE_FIX = re.compile(r"\b(?:remov\w*|delet\w*|drop\w*|cut|cutting|strik\w*|omit\w*|eliminat\w*|get rid of|take out|scrap\w*)\b", re.I)
PART_WORDS = {
    "TLDR": re.compile(r"\btl;?\s?dr\b|\bblockquote\b|\bsummary (?:block|box|quote)\b", re.I),
    "hero": re.compile(r"\bhero\b", re.I),
    "Read next": re.compile(r"\bread next\b", re.I),
    "bio": re.compile(r"\b(?:author )?bio\b", re.I),
    "pass-it-on": re.compile(r"\bpass[- ]it[- ]on\b|\bpassed it on\b|\bsharing line\b|\bshare line\b", re.I),
}
SUB_SPAN = re.compile(r"\b(?:sentence|clause|phrase|word|claim|number|figure|statistic|adjective|adverb|hedge)s?\b", re.I)
FURNITURE_REASON = ("{part} is required furniture of the medium-article-generator skill; removing it is not a valid fix. "
                    "Its content (claims, repetition) may still be fixed in place")


def _verb_then(part_rx: re.Pattern, fix: str) -> bool:
    """A remove verb followed within a few words by the furniture name: "remove the TLDR", "delete this entire bio block"."""
    return any(part_rx.search(" ".join(fix[m.end():].split()[:5])) for m in REMOVE_FIX.finditer(fix))


def furniture_elements(cand: str) -> dict[str, list[str]]:
    """Normalised text of each required furniture element present in `cand`: hero image and caption, TLDR, and the footer's Read next / bio / pass-it-on."""
    from . import furniture as FU
    out: dict[str, list[str]] = {k: [] for k in PART_WORDS}
    hero = FU.hero_line(cand)
    if hero:
        out["hero"].append(_norm(hero))
    cap = FU.caption_text(cand)
    if cap:
        out["hero"].append(_norm(cap))
    tl = FU.tldr_text(cand)
    if tl:
        out["TLDR"].append(_norm(tl))
    _, foot = FU.split_footer(cand)
    for para in re.split(r"\n\s*\n", foot or ""):
        t = para.strip()
        if not t or set(t) <= {"-"}:
            continue
        key = "Read next" if re.match(r"read next\b", t, re.I) else "pass-it-on" if PART_WORDS["pass-it-on"].search(t) else "bio"
        out[key].append(_norm(t))
    return out


def _covers(passage: str, element: str) -> bool:
    """The quoted passage is the whole element (or most of it), or is the whole element's text restated inside a larger quote."""
    p = _norm(passage)
    return bool(p and element and (p == element or (element in p) or (p in element and len(p) >= 0.8 * len(element))))


def furniture_filter(findings: list[dict], cand: str) -> list[dict]:
    """Deterministic backstop for a critic that flags required furniture (hero, TLDR, Read next, bio, pass-it-on) for removal.
    A finding whose fix is "remove/delete" of one whole furniture element becomes `not_applicable` (original severity kept, reason recorded)
    and never counts toward READY. A fix that only edits the element's content (a claim, a repeated phrase) is left untouched."""
    els = furniture_elements(cand)
    out = []
    for f in findings:
        fix = str(f.get("fix") or "")
        part = None
        if f.get("severity") in ("major", "minor") and REMOVE_FIX.search(fix):
            part = next((k for k, rx in PART_WORDS.items() if _verb_then(rx, fix)), None)
            if part is None and not SUB_SPAN.search(fix):  # "remove it" on a passage that is a whole furniture element
                part = next((k for k, ts in els.items() if any(_covers(str(f.get("passage") or ""), t) for t in ts)), None)
        if part:
            f = {**f, "original_severity": f["severity"], "severity": "not_applicable", "not_applicable": FURNITURE_REASON.format(part=part)}
        out.append(f)
    return out
