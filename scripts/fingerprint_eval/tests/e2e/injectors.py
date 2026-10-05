"""Content mutations for the fixture article. Each takes article markdown and returns new markdown;
each asserts its anchor exists so a fixture edit can never turn a mutation into a silent no-op."""
from __future__ import annotations

import re
from pathlib import Path

from scripts.fingerprint_eval.added import NEGATIONS, NUMBER_WORDS

LINK = re.compile(r"(?<!!)\[([^\]]+)\]\((https?://[^)]+)\)")
IMAGE = re.compile(r"^!\[[^\]]*\]\([^)]*\)\n\n?", re.M)

ALTER_FROM = "about ten to twenty minutes per patient"
ALTER_TO = "about ten to twenty hours per patient"
DELETE_HEADING = "## A dream can spend the night on your behalf"
ABOUT = "## About the author"

UNSUPPORTED_SECTION = (
    "## A pill that reverses aging\n\n"
    "A single daily capsule of vitamin Q reversed biological age by thirty years in a 2025 trial of nine hundred volunteers. "
    "The manufacturer confirmed that no side effects appeared in any participant.\n\n"
)


def remove_one_link(md: str) -> str:
    m = LINK.search(md)
    assert m, "fixture has no inline link"
    return md[: m.start()] + m.group(1) + md[m.end():]


def alter_claim(md: str) -> str:
    assert ALTER_FROM in md
    return md.replace(ALTER_FROM, ALTER_TO, 1)


def delete_section(md: str, heading: str = DELETE_HEADING) -> str:
    start = md.index(heading)
    nxt = md.find("\n## ", start + len(heading))
    return md[:start] + md[nxt + 1:]


def delete_image(md: str) -> str:
    m = IMAGE.search(md)
    assert m, "fixture has no image"
    return md[: m.start()] + md[m.end():]


def add_unsupported_section(md: str) -> str:
    """New section with no counterpart in the reference and no support in the source notes."""
    i = md.index(ABOUT)
    return md[:i] + UNSUPPORTED_SECTION + md[i:]


def style_only(md: str) -> str:
    """Style anomaly only: appends rhetorical three-item fragments to several paragraphs. Every original
    sentence stays byte-identical and no checkable fact is added, so the blocking checks must still pass
    while rule-of-three / n-gram advisories move."""
    out, n = [], 0
    for para in md.split("\n\n"):
        out.append(para)
        if n < 6 and len(para.split()) > 25 and not para.startswith(("#", "!", ">", "-", "*", "[")) and para.rstrip()[-1:] in ".?!":
            pool = []  # lowercase plain words of this very paragraph (same section): rhythm, not facts, and never a new token
            for w in re.findall(r"(?<![\w'-])[a-z]{5,}(?![\w'-])", para):
                if w not in pool and w not in NUMBER_WORDS and w not in NEGATIONS:
                    pool.append(w)
            assert len(pool) >= 3
            out[-1] = para.rstrip() + f" {pool[0].capitalize()}, {pool[1]}, and {pool[2]}."
            n += 1
    assert n >= 3
    return "\n\n".join(out)


def modify_after_pass(final: Path) -> str:
    """Edit the final file after it was authorized (a human touch-up). Returns the new text."""
    text = final.read_text().rstrip("\n") + "\n\nOne more thought added after approval.\n"
    final.write_text(text)
    return text


def damage_more(md: str) -> str:
    """What a bad repairer does: strips every link and a whole section on top of whatever was broken."""
    return delete_section(LINK.sub(r"\1", md), "## Cancer is a control-system failure")


MUTATIONS = {
    "missing_link": remove_one_link,
    "altered_claim": alter_claim,
    "deleted_section": delete_section,
    "deleted_image": delete_image,
    "unsupported_section": add_unsupported_section,
    "style_only": style_only,
}
