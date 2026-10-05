"""Sandbox copies of a package, tree digests (proof the source is never written), and generic article mutations."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

from scripts.fingerprint_eval.added import NUMBER_WORDS

COPY_IGNORE = shutil.ignore_patterns("release", "QUARANTINE.json", "__pycache__", ".DS_Store")  # a fresh gate run starts clean


def sha(data: bytes | str) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def tree_digest(root: Path) -> str:
    """sha256 over sorted relative paths + bytes of every file under root."""
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file():
            h.update(p.relative_to(root).as_posix().encode() + b"\0" + p.read_bytes() + b"\0")
    return h.hexdigest()


def copy_package(src: Path, dst: Path, slug: str | None = None) -> Path:
    """Copy src to dst (never the reverse). With `slug`, keep version.json's slug equal to the directory name."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, ignore=COPY_IGNORE)
    vj = dst / "version.json"
    if slug and vj.exists():
        d = json.loads(vj.read_text())
        if "slug" in d:
            d["slug"] = slug
            vj.write_text(json.dumps(d, indent=2) + "\n")
    return dst


def _version(pkg: Path) -> dict:
    p = pkg / "version.json"
    return json.loads(p.read_text()) if p.exists() else {}


def reference_file(pkg: Path) -> Path | None:
    f = _version(pkg).get("articleFile")
    return pkg / f if f else None


def final_file(pkg: Path) -> Path:
    """Mirror of the documented resolver: version.json.finalFile > article-medium.md > version.json.articleFile."""
    v = _version(pkg)
    if v.get("finalFile"):
        return pkg / v["finalFile"]
    if (pkg / "article-medium.md").exists():
        return pkg / "article-medium.md"
    return pkg / v["articleFile"]


def edit_final(pkg: Path, fn) -> tuple[Path, str]:
    """Apply fn(text)->text to the final candidate. If the final IS the rated reference (articleFile) the edit goes to a
    new article-medium.md instead, so the reference stays intact and repair stays possible. Returns (path, new sha)."""
    fin, ref = final_file(pkg), reference_file(pkg)
    text = fn(fin.read_text())
    if ref is not None and fin.resolve() == ref.resolve():
        d = _version(pkg)
        if d.pop("finalFile", None) is not None:
            (pkg / "version.json").write_text(json.dumps(d, indent=2) + "\n")
        fin = pkg / "article-medium.md"
    fin.write_text(text)
    return fin, sha(fin.read_bytes())


# ---- generic mutations (no fixture-specific anchors) ---------------------------------------------------------------
LINK = re.compile(r"(?<!!)\[([^\]]+)\]\((https?://[^)]+)\)")
SECTION = re.compile(r"^## .*$", re.M)
UNSUPPORTED = (
    "## A pill that reverses aging\n\n"
    "A single daily capsule of vitamin Q reversed biological age by thirty years in a 2025 trial of nine hundred volunteers. "
    "The manufacturer confirmed that no side effects appeared in any participant.\n\n"
)
SWAP = {"one": "ninety", "two": "ninety", "three": "ninety", "four": "ninety", "five": "ninety", "six": "ninety", "seven": "seventy",
        "eight": "ninety", "nine": "ninety", "ten": "ninety", "twenty": "ninety", "thirty": "ninety", "ninety": "ten"}
_DIGITS = re.compile(r"(?<![\w/.-])\d{1,3}(?![\w/.%-])")


def remove_one_link(md: str) -> str:
    m = LINK.search(md)
    assert m, "article has no inline link"
    return md[: m.start()] + m.group(1) + md[m.end():]


def _prose_sentences(md: str):
    for para in md.split("\n\n"):
        if para.startswith(("#", "!", ">", "-", "*", "|", "[", "```")):
            continue
        for s in re.split(r"(?<=[.!?])\s+", para):
            if len(s.split()) >= 6:
                yield s


def alter_number(md: str) -> tuple[str, str, str]:
    """Change one number in one prose sentence. Returns (new_md, sentence_before, sentence_after)."""
    for s in _prose_sentences(md):
        spans = [m.span() for m in LINK.finditer(s)]
        for m in _DIGITS.finditer(s):
            if any(a < m.start() < b for a, b in spans):
                continue
            new = s[: m.start()] + str(int(m.group(0)) * 10 + 7) + s[m.end():]
            return md.replace(s, new, 1), s, new
        if not spans:  # number words only in link-free sentences, so the swap can never touch a URL
            for m in re.finditer(r"\b[a-z]+\b", s):
                w = m.group(0)
                if w in SWAP and w in NUMBER_WORDS:
                    new = s[: m.start()] + SWAP[w] + s[m.end():]
                    return md.replace(s, new, 1), s, new
    raise AssertionError("no number or number word found in a prose sentence")


def delete_middle_section(md: str) -> tuple[str, str]:
    heads = list(SECTION.finditer(md))
    assert len(heads) >= 3, "article needs at least 3 sections"
    i = (len(heads) - 1) // 2
    return md[: heads[i].start()] + md[heads[i + 1].start():], heads[i].group(0)


def add_unsupported_section(md: str) -> str:
    heads = list(SECTION.finditer(md))
    at = heads[-1].start() if heads else len(md)
    return md[:at] + UNSUPPORTED + md[at:]
