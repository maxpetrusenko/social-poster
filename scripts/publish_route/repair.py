"""Router-owned deterministic repairs (title suffix, subtitle) plus final-file rebinding.

Only text that already exists in the package is used: an approved shorter subtitle from the title candidates, or the
removal of a title suffix equal to the queue item's channel/source name. Output is a NEW file, never an overwrite.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

from scripts.medium_review import checks as CK


def _atomic_write(path: Path, data: bytes) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _find_title_sub(text: str) -> tuple[int | None, int | None]:
    lines = CK.prose_lines(text)
    ti = next((i for i, ln in lines if (m := CK.HEADING.match(ln)) and len(m.group(1)) == 1), None)
    if ti is None:
        return None, None
    seen = 0
    for i, ln in lines:
        if i <= ti or not ln.strip():
            continue
        s = ln.strip()
        if re.fullmatch(r"(\*|_)(?!\1).+\1", s) and not s.startswith("**"):
            return ti, i
        seen += 1
        if seen > 4:
            break
    return ti, None


def apply_own(text: str, repairs: list[dict]) -> tuple[str, list[str]]:
    """Return (new text, applied descriptions). A repair whose anchor is not found, or whose result does not re-parse as
    intended, is skipped rather than guessed."""
    applied: list[str] = []
    for r in repairs:
        lines = text.split("\n")
        ti, si = _find_title_sub(text)
        if r["kind"] == "title_suffix_strip" and ti is not None:
            m = CK.HEADING.match(lines[ti])
            old = m.group(2)
            suffix = " | " + r["suffix"]
            if old.endswith(suffix):
                lines[ti] = f"# {old[: -len(suffix)].rstrip()}"
                new = "\n".join(lines)
                if CK.title_and_subtitle(new)[0] == old[: -len(suffix)].rstrip():
                    text = new
                    applied.append(f"title suffix {r['suffix']!r} removed")
        elif r["kind"] == "subtitle_trim" and si is not None:
            marker = "*" if lines[si].strip().startswith("*") else "_"
            lines[si] = f"{marker}{r['to']}{marker}"
            new = "\n".join(lines)
            if CK.title_and_subtitle(new)[1] == r["to"]:
                text = new
                applied.append("subtitle replaced by approved shorter variant")
    return text, applied


def next_route_fix_path(package: Path) -> Path:
    nums = [int(m.group(1)) for p in package.glob("article-route-fix-*.md") if (m := re.fullmatch(r"article-route-fix-(\d+)\.md", p.name))]
    return package / f"article-route-fix-{max(nums, default=0) + 1}.md"


def write_new_version(package: Path, text: str) -> Path:
    p = next_route_fix_path(package)
    with open(p, "x") as fh:  # never overwrites
        fh.write(text)
    return p


def rebind_final(package: Path, new_path: Path) -> None:
    """Point version.json.finalFile at the new bytes so the canonical resolver (release authorize) evaluates them."""
    vj = package / "version.json"
    d = json.loads(vj.read_text()) if vj.exists() else {}
    d["finalFile"] = str(new_path.resolve().relative_to(package.resolve()))
    _atomic_write(vj, (json.dumps(d, indent=2, ensure_ascii=False) + "\n").encode())
