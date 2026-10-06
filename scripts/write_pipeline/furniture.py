"""Article furniture: the parts of a Medium package that are not the argument. Hero image, TLDR blockquote, and the footer
(Read next, author bio, first-person pass-it-on line, optional disclosure).

FINAL.md = title, subtitle, hero, TLDR, body, footer. The footer is frozen boilerplate: it is rendered from its sources (bio.md read
verbatim, the submitted Read next and sharing line, the disclosure), the evaluator gate extracts no claims from it, and any edit to it
is a failure here (compared verbatim against the sources). The TLDR text comes from the title stage and is claims-checked against the body.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import urlparse

from scripts.fingerprint_eval.rewrite import footer_start
from scripts.fingerprint_eval.textutil import parse_blocks

from . import mdlib as M
from .core import Pipeline

BIO_ENV = "WRITE_PIPELINE_BIO"
DEFAULT_BIO = Path.home() / "Desktop/Projects/medium-automation/bio.md"
DEFAULT_PASS_IT_ON = "If this was useful, I would be glad if you passed it on to someone who is deciding the same thing."
HERO_PATH = "assets/hero.jpg"
TLDR_MIN_WORDS, TLDR_MAX_WORDS = 15, 90
BAD_TLDR = re.compile(r"^\W*(?:direct answer|tl;?dr)\b", re.I)
PARTS = ("hero", "TLDR", "Read next", "bio", "pass-it-on", "disclosure")


class FurnitureError(ValueError):
    pass


def bio_path() -> Path:
    return Path(os.environ.get(BIO_ENV) or DEFAULT_BIO).expanduser()


def load_bio() -> str:
    """The author bio, verbatim: the first block of bio.md, before the first horizontal rule (bio.md carries its own Read next line below it)."""
    p = bio_path()
    try:
        raw = p.read_text()
    except (OSError, UnicodeDecodeError) as e:
        raise FurnitureError(f"cannot read the author bio at {p} (set {BIO_ENV}): {e}") from e
    raw = re.sub(r"\A(?:\s*-{2,}\s*\n)+", "", raw)  # the real bio.md opens with a stray "--" line; leading rules are not part of the bio
    bio = re.split(r"^\s*---\s*$", raw, maxsplit=1, flags=re.M)[0].strip()
    if not bio:
        raise FurnitureError(f"the author bio file {p} is empty")
    return bio


def valid_medium_url(u: object) -> bool:
    if not isinstance(u, str) or re.search(r"[\s()<>\[\]]", u):
        return False
    p = urlparse(u)
    host = (p.hostname or "").lower()
    return p.scheme == "https" and (host == "medium.com" or host.endswith(".medium.com")) and len(p.path.strip("/")) > 0


def check_read_next(rn: object) -> list[str]:
    """Format only: a title and a medium.com URL. Nothing is invented and nothing is fetched."""
    if rn is None:
        return []
    if not isinstance(rn, dict):
        return ["titles: 'read_next' must be {title, url} or omitted"]
    out = []
    t = rn.get("title")
    if not isinstance(t, str) or not t.strip() or re.search(r"[\[\]\n]", t):
        out.append("titles: read_next.title must be one line of text without brackets")
    if not valid_medium_url(rn.get("url")):
        out.append("titles: read_next.url must be an https medium.com URL (a medium.com path or a *.medium.com publication)")
    return out


def check_tldr(tldr: object, body: str, ev: dict | None = None) -> list[str]:
    """Deterministic floor for the TLDR; the claims gate adds the semantic check against the body (submit.py)."""
    from .validators import asserted_unresolved
    if not isinstance(tldr, str) or not tldr.strip():
        return ["titles: 'tldr' is required: one paragraph summarising the article, rendered as a blockquote right after the hero"]
    out, t = [], tldr.strip()
    n = len(t.split())
    if "\n" in t:
        out.append("titles: tldr must be one paragraph on one line")
    if not TLDR_MIN_WORDS <= n <= TLDR_MAX_WORDS:
        out.append(f"titles: tldr is {n} words, need {TLDR_MIN_WORDS} to {TLDR_MAX_WORDS}")
    if BAD_TLDR.search(t):
        out.append("titles: the tldr must not open with 'Direct answer' or a 'TLDR:' label; the blockquote is the label")
    if t.startswith((">", "#", "-", "*", "`", "!")) or M.URL_RE.search(t) or re.search(r"\]\(", t):
        out.append("titles: tldr must be plain prose: no markdown block, link or URL")
    if "—" in t:
        out.append("titles: tldr has an em dash")
    bad = [k for k in M.significant_numbers(t) if k not in M.significant_numbers(body)]
    if bad:
        out.append(f"titles: tldr number {bad[:2]} is not in the body (the TLDR adds no new claims)")
    if M.EXPERIENCE.search(t):
        out.append("titles: tldr makes a first-person experience claim")
    if ev and asserted_unresolved(t, ev):
        out.append("titles: tldr asserts an unresolved claim")
    return out


def check_footer_inputs(data: dict) -> list[str]:
    out = check_read_next(data.get("read_next"))
    for k in ("pass_it_on", "disclosure"):
        v = data.get(k)
        if v is not None and (not isinstance(v, str) or not v.strip() or "\n" in v.strip()):
            out.append(f"titles: {k} must be one line of text or omitted")
    pi = data.get("pass_it_on")
    if isinstance(pi, str) and pi.strip() and not re.search(r"\b(?:I|my|me|I'd|I'll)\b", pi):
        out.append("titles: pass_it_on must be first person (I, my, me)")
    return out


def from_title(t: dict) -> dict:
    """The furniture inputs recorded by the title stage."""
    rn = t.get("read_next") if isinstance(t.get("read_next"), dict) else None
    return {"tldr": str(t.get("tldr") or "").strip(), "read_next": ({"title": rn["title"].strip(), "url": rn["url"].strip()} if rn else None),
            "pass_it_on": str(t.get("pass_it_on") or "").strip() or DEFAULT_PASS_IT_ON, "disclosure": str(t.get("disclosure") or "").strip() or None}


def footer_md(furn: dict, bio: str) -> str:
    """`---`, Read next, `---`, bio, pass-it-on, disclosure. Without a Read next line: `---`, bio, pass-it-on (an AUTHOR OPPORTUNITY is recorded)."""
    rn = furn.get("read_next")
    parts = ["---"]
    if rn:
        parts += [f"Read next: [{rn['title']}]({rn['url']})", "---"]
    parts += [bio, furn["pass_it_on"]]
    if furn.get("disclosure"):
        parts.append(furn["disclosure"])
    return "\n\n".join(parts) + "\n"


def tldr_md(furn: dict) -> str:
    return "> " + furn["tldr"]


def author_opportunity(furn: dict) -> str | None:
    if furn.get("read_next"):
        return None
    return "AUTHOR OPPORTUNITY: add a related published Medium article (title and medium.com URL) so the footer can carry its Read next line; none was provided and none was invented"


def split_footer(md: str) -> tuple[str, str | None]:
    """(text before the footer, the footer text or None), using the same footer detection the evaluator gate freezes."""
    blocks = parse_blocks(md)
    i = footer_start(blocks)
    if i is None:
        return md, None
    return "\n\n".join(b.text for b in blocks[:i]) + "\n", "\n\n".join(b.text for b in blocks[i:]) + "\n"


def footer_changed(ref: str, cand: str) -> str | None:
    """Reason when the frozen footer of `cand` differs from the one in `ref`, else None. Used by the strict edit guard."""
    _, rf = split_footer(ref)
    _, cf = split_footer(cand)
    if rf is None:
        return None
    if cf is None:
        return "the frozen article footer (Read next, author bio, sharing line) was removed"
    if rf != cf:
        return "the frozen article footer (Read next, author bio, sharing line, disclosure) was edited; it must match its source verbatim"
    return None


def _head_blocks(text: str) -> list:
    t, s, k = M.title_subtitle(text)
    lines = text.split("\n")[k:] if t else text.split("\n")
    return parse_blocks("\n".join(lines))


def hero_line(text: str) -> str | None:
    """The hero image reference when the first block under the title and subtitle is an image."""
    bl = _head_blocks(text)
    return bl[0].text if bl and bl[0].kind == "image" else None


def tldr_block(text: str) -> str | None:
    """The blockquote that follows the hero (and its caption), if any."""
    bl = _head_blocks(text)
    if not bl or bl[0].kind != "image":
        return None
    for b in bl[1:3]:
        if b.kind == "quote":
            return b.text
    return None


def status(text: str, furn: dict | None, bio: str | None) -> dict[str, str]:
    """Per part: 'present' or 'missing' (disclosure: 'present' or 'none requested')."""
    core, foot = split_footer(text)
    hero, tl = hero_line(text), tldr_block(text)
    out = {"hero": "present" if hero and HERO_PATH in hero else "missing", "TLDR": "present" if tl else "missing"}
    out["Read next"] = "present" if foot and re.search(r"^Read next: \[[^\]]+\]\(https://[^)]+\)$", foot, re.M) else "missing"
    out["bio"] = "present" if foot and bio and bio in foot else "missing"
    pi = (furn or {}).get("pass_it_on")
    out["pass-it-on"] = "present" if foot and pi and pi in foot else "missing"
    dis = (furn or {}).get("disclosure")
    out["disclosure"] = ("present" if foot and dis in foot else "missing") if dis else "none requested (the skill does not require one)"
    return out


def verify(text: str, furn: dict, bio: str, exact_tldr: bool = True) -> list[str]:
    """Verbatim comparison of the furniture in FINAL.md against its sources. Empty list = intact. The footer is always compared verbatim.
    The TLDR must match the submitted one unless the author edited FINAL.md (exact_tldr False): then it must still be a blockquote
    right after the hero that is not labelled 'Direct answer'; the evaluator's frozen-block comparison and the author rebase govern the edit."""
    out = []
    core, foot = split_footer(text)
    want = footer_md(furn, bio)
    if foot is None:
        out.append("furniture: the footer (Read next, author bio, sharing line) is missing")
    elif foot != want:
        out.append("furniture: the frozen footer differs from its sources (bio.md, the submitted Read next and sharing line, the disclosure): " + _first_diff(want, foot))
    hero, tl = hero_line(text), tldr_block(text)
    if not hero or HERO_PATH not in hero:
        out.append(f"furniture: the hero image ({HERO_PATH}) must be the first block under the title and subtitle")
    if tl is None:
        out.append("furniture: the TLDR blockquote must follow the hero")
    elif exact_tldr and tl != tldr_md(furn):
        out.append("furniture: the TLDR blockquote must match the submitted tldr verbatim")
    elif BAD_TLDR.search(tl.lstrip("> ")):
        out.append("furniture: the TLDR must not open with 'Direct answer' or a 'TLDR:' label")
    return out


def _first_diff(want: str, got: str) -> str:
    wl, gl = want.split("\n"), got.split("\n")
    for a, b in zip(wl, gl):
        if a != b:
            return f"expected {a[:80]!r}, found {b[:80]!r}"
    return f"expected {len(wl)} lines, found {len(gl)}"


def pipeline_inputs(pipe: Pipeline) -> tuple[dict, str]:
    """(furniture inputs from the recorded title stage, the bio read now)."""
    return from_title(pipe.read_json("title")), load_bio()


def report_lines(pipe: Pipeline, text: str) -> list[str]:
    try:
        furn, bio = from_title(pipe.read_json("title")), load_bio()
    except Exception:  # noqa: BLE001  a report never fails the package
        furn, bio = None, None
    st = status(text, furn, bio)
    lines = [f"- {k}: {st[k]}" for k in PARTS]
    if furn and furn.get("read_next"):
        lines.append(f"  - Read next target: {furn['read_next']['title']} ({furn['read_next']['url']})")
    opp = author_opportunity(furn) if furn else None
    if opp:
        lines.append(f"- {opp}")
    lines.append(f"- bio source: {bio_path()}")
    return lines
