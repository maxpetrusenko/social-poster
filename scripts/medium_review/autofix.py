"""SAFE deterministic fixes only. Never edits claims.

Fix kinds (one new file per kind that changed something, cumulative, never overwriting):
  alt_text        missing/placeholder ALT from an existing caption, a meaningful filename, or the nearest heading
  image_credit    credit line from provenance already recorded in version.json / assets manifests
  formatting      heading spacing, empty-link unwrap, YouTube timestamp param strip, blank-line collapse, trailing space
  source_links    re-attach a link that source-notes records (wrap exact label text, else add to a Sources section)
  dedupe          remove exact duplicated paragraphs / repeated sentences
  tags            tags-medium-fix-<n>.json proposal (metadata only; version.json/workflow.json untouched)
Outputs: article-medium-fix-<n>.md in the package dir.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from . import checks as CK
from .package import ReviewCtx, sha256_bytes

CODE_OR_LINK = re.compile(r"(`[^`\n]*`|!?\[[^\]]*\]\([^)]*\)|<https?://[^>]+>|https?://\S+)")
GENERIC_FILE = re.compile(r"(?i)^(img|image|photo|dsc|screenshot|untitled|frame|pic)?[-_ ]*\d*$|^[0-9a-f]{8,}$")


def humanize_filename(src: str) -> str | None:
    stem = Path(src.split("?")[0]).stem
    stem = re.sub(r"^\d+[-_ ]+", "", stem)
    if GENERIC_FILE.match(stem) or len(stem) < 4:
        return None
    words = re.sub(r"[-_]+", " ", stem).strip()
    return words[:1].upper() + words[1:]


def _caption_after(lines: list[str], i: int) -> tuple[int, str] | None:
    for j in range(i + 1, min(len(lines), i + 3)):
        s = lines[j].strip()
        if not s:
            continue
        if re.fullmatch(r"(\*|_)(?!\1).+\1", s) and not s.startswith("**"):
            return j, s.strip("*_").strip()
        return None
    return None


def _heading_above(lines: list[str], i: int) -> str | None:
    for j in range(i - 1, -1, -1):
        m = CK.HEADING.match(lines[j])
        if m and len(m.group(1)) >= 2:  # the H1 title says nothing about this image
            return m.group(2)
    return None


def alt_text(lines: list[str]) -> list[str]:
    changes = []
    code = {i for i, _, c in CK.scan_lines("\n".join(lines)) if c}
    for i, ln in enumerate(lines):
        if i in code:
            continue

        def sub(m: re.Match) -> str:
            alt, src = m.group(1).strip(), m.group(2)
            if alt and not CK.GENERIC_ALT.match(alt) and not re.fullmatch(r"[\w-]+\.(png|jpe?g|gif|webp)", alt, re.I):
                return m.group(0)
            cap = _caption_after(lines, i)
            new, how = None, ""
            if cap:
                new, how = cap[1][:200], "existing caption"
            elif (hf := humanize_filename(src)):
                new, how = hf, "filename"
            elif (h := _heading_above(lines, i)):
                new, how = f"Image in the section titled {h}", "nearby heading"
            if not new:
                return m.group(0)
            new = new.replace("[", "(").replace("]", ")")
            changes.append(f"L{i + 1}: ALT from {how}: {new!r}")
            return m.group(0).replace(f"![{m.group(1)}]", f"![{new}]", 1)
        lines[i] = CK.IMG_LINE.sub(sub, ln)
    return changes


def image_credit(lines: list[str], ctx: ReviewCtx) -> list[str]:
    prov = CK.load_provenance(ctx.package, ctx.version)
    if not prov:
        return []
    changes, inserts = [], []
    code = {i for i, _, c in CK.scan_lines("\n".join(lines)) if c}
    for i, ln in enumerate(lines):
        if i in code:
            continue
        for m in CK.IMG_LINE.finditer(ln):
            p = prov.get(Path(m.group(2)).name)
            if p and CK.credit_text(p) and not CK.has_credit_near(lines, i, p):
                cap = _caption_after(lines, i)
                where = cap[0] if cap else i
                inserts.append((where, f"*Image credit: {CK.credit_text(p)}*", Path(m.group(2)).name))
    for where, text, name in sorted(set(inserts), reverse=True):
        lines[where + 1:where + 1] = ["", text]
        changes.append(f"credit for {name}: {text}")
    return sorted(changes)


def formatting(lines: list[str]) -> list[str]:
    changes = []
    code = {i for i, _, c in CK.scan_lines("\n".join(lines)) if c}
    out: list[str] = []
    for i, ln in enumerate(lines):
        if i in code:
            out.append(ln)
            continue
        new = ln.rstrip() if ln != ln.rstrip() and not ln.endswith("  ") else ln
        new = re.sub(r"^(#{1,6})([^#\s])", r"\1 \2", new)
        new = re.sub(r"(?<!!)\[([^\]]+)\]\(\s*(?:#)?\s*\)", r"\1", new)

        def ts(m: re.Match) -> str:
            url = m.group(2)
            if re.search(r"(?i)(youtu\.be|youtube\.com)", url) and re.search(r"[?&]t=\d", url):
                url = re.sub(r"[?&]t=\d+s?", "", url, count=1)
                url = url.replace("&", "?", 1) if "?" not in url and "&" in url else url
            return f"[{m.group(1)}]({url})"
        new = CK.LINK.sub(ts, new)
        if new != ln:
            changes.append(f"L{i + 1}: {ln.strip()[:50]!r} cleaned")
        out.append(new)
    collapsed: list[str] = []
    blank_run = 0
    for i, ln in enumerate(out):
        blank_run = blank_run + 1 if not ln.strip() and i not in code else 0
        if blank_run > 1:
            changes.append(f"L{i + 1}: extra blank line removed")
            continue
        collapsed.append(ln)
    lines[:] = collapsed
    return changes


def source_links(lines: list[str], ctx: ReviewCtx) -> list[str]:
    if not ctx.source_notes:
        return []
    notes = CK.source_note_links(ctx.source_notes.read_text())
    have = {CK.norm_url(u) for u in CK.URL_RE.findall("\n".join(lines))}
    changes = []
    for url, label in notes.items():
        if url in have:
            continue
        raw_url = next((u for u in CK.URL_RE.findall(ctx.source_notes.read_text()) if CK.norm_url(u) == url), url)
        done = False
        if len(label) >= 4:
            code = {i for i, _, c in CK.scan_lines("\n".join(lines)) if c}
            for i, ln in enumerate(lines):
                if i in code or CK.HEADING.match(ln) or ln.lstrip().startswith("!["):
                    continue
                parts = CODE_OR_LINK.split(ln)
                for k in range(0, len(parts), 2):  # even parts are plain text
                    if label in parts[k]:
                        parts[k] = parts[k].replace(label, f"[{label}]({raw_url})", 1)
                        lines[i] = "".join(parts)
                        changes.append(f"wrapped {label!r} -> {raw_url}")
                        done = True
                        break
                if done:
                    break
        if done:
            continue
        for i, ln in enumerate(lines):
            m = CK.HEADING.match(ln)
            if m and re.search(r"(?i)\bsources?\b|references", m.group(2)):
                end = i
                for j in range(i + 1, len(lines)):
                    if CK.HEADING.match(lines[j]):
                        break
                    if lines[j].strip():
                        end = j
                lines.insert(end + 1, f"- [{label or raw_url}]({raw_url})")
                changes.append(f"added source bullet {raw_url}")
                break
    return changes


def _para_ranges(lines: list[str]) -> list[tuple[int, int]]:
    out, start, fence = [], None, False
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith(("```", "~~~")):
            fence = not fence
            start = i if start is None else start
            continue
        if fence:
            continue
        if ln.strip():
            start = i if start is None else start
        elif start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(lines) - 1))
    return out


def dedupe(lines: list[str]) -> list[str]:
    changes, seen = [], set()
    drop: list[tuple[int, int]] = []
    for a, b in _para_ranges(lines):
        txt = "\n".join(lines[a:b + 1])
        if re.match(r"^\s*(#|!\[|>|[-*+]\s|\d+[.)]\s|\||```|~~~|---)", txt) or len(txt) < 40:
            continue
        key = " ".join(txt.split()).lower()
        if key in seen:
            drop.append((a, b))
            changes.append(f"removed duplicate paragraph: {txt[:60]!r}")
        seen.add(key)
    for a, b in reversed(drop):
        end = b + 2 if b + 1 < len(lines) and not lines[b + 1].strip() else b + 1
        del lines[a:end]
    for i, ln in enumerate(lines):
        if re.match(r"^\s*(#|!\[|>|[-*+]\s|\d+[.)]\s|\||```)", ln):
            continue
        sents = [s for s in CK.SENT_SPLIT_RE.split(ln)]
        if len(sents) < 2:
            continue
        keep, seen_s = [], set()
        for s in sents:
            k = " ".join(s.split()).lower()
            if len(k) >= 40 and k in seen_s:
                changes.append(f"L{i + 1}: removed repeated sentence {s[:50]!r}")
                continue
            seen_s.add(k)
            keep.append(s)
        if len(keep) != len(sents):
            lines[i] = " ".join(keep)
    return changes


STEPS = ("alt_text", "image_credit", "formatting", "source_links", "dedupe")


def compute(article: str, ctx: ReviewCtx) -> list[dict]:
    """Sequential cumulative fixes: [{kind, changes, text_after}] for kinds that changed something."""
    trailing_nl = article.endswith("\n")
    lines = article.replace("\r\n", "\n").split("\n")
    if trailing_nl and lines and lines[-1] == "":
        lines.pop()
    steps = []
    for kind in STEPS:
        changes = {"alt_text": alt_text, "image_credit": lambda l: image_credit(l, ctx), "formatting": formatting,
                   "source_links": lambda l: source_links(l, ctx), "dedupe": dedupe}[kind](lines)
        if changes:
            steps.append({"kind": kind, "changes": changes, "text_after": "\n".join(lines) + ("\n" if trailing_nl else "")})
    return steps


def tag_fix(ctx: ReviewCtx) -> dict | None:
    tg = CK.parse_tags(ctx.version, ctx.workflow)
    present = {k: v for k, v in tg.items() if v is not None}
    if not present:
        return None
    base = present.get("version.json") or present.get("workflow.json") or []
    fixed = CK.normalize_tags(base)
    needs = fixed != [str(t) for t in base] or any(CK.normalize_tags(v) != fixed for v in present.values())
    if not needs:
        return None
    return {"tags": fixed, "rule": "version.json tags win; trim, dedupe case-insensitively, keep first 5", "from": present}


def available_fixes(article: str, ctx: ReviewCtx) -> list[dict]:
    out = [{"kind": s["kind"], "status": "available", "description": f"{s['kind']}: {len(s['changes'])} change(s)", "changes": s["changes"]}
           for s in compute(article, ctx)]
    t = tag_fix(ctx)
    if t:
        out.append({"kind": "tags", "status": "available", "description": f"tags -> {t['tags']}", "changes": [t["rule"]]})
    return out


def _next_n(d: Path, pattern: str) -> int:
    nums = [int(m.group(1)) for p in d.glob(pattern.replace("{n}", "*")) if (m := re.search(r"fix-(\d+)", p.name))]
    return max(nums, default=0) + 1


def apply_fixes(ctx: ReviewCtx, out_dir: Path | None = None) -> list[dict]:
    """Write one new article-medium-fix-<n>.md per changed kind. Returns the fix list (never overwrites files)."""
    out_dir = out_dir or ctx.package
    article = ctx.article_path.read_text()
    fixes = []
    n = _next_n(out_dir, "article-medium-fix-{n}.md")
    for s in compute(article, ctx):
        path = out_dir / f"article-medium-fix-{n}.md"
        with open(path, "x") as fh:
            fh.write(s["text_after"])
        fixes.append({"n": n, "kind": s["kind"], "status": "applied", "path": str(path), "sha256": sha256_bytes(s["text_after"].encode()),
                      "description": f"{s['kind']}: {len(s['changes'])} change(s)", "changes": s["changes"],
                      "requires_integrity_gate": True})
        n += 1
    t = tag_fix(ctx)
    if t:
        tn = _next_n(out_dir, "tags-medium-fix-{n}.json")
        path = out_dir / f"tags-medium-fix-{tn}.json"
        with open(path, "x") as fh:
            fh.write(json.dumps(t, indent=2) + "\n")
        fixes.append({"n": tn, "kind": "tags", "status": "applied", "path": str(path), "description": f"tags -> {t['tags']}",
                      "changes": [t["rule"]], "requires_integrity_gate": False})
    return fixes
