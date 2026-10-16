"""Post-publish steps, run by hand after the story is live. Never calls Medium.

    python -m scripts.write_pipeline postpublish friendlink --package P --url U --paywalled yes|no

FINAL.md never carries the friend link: it is hash-bound (an edit would trip USER_MODIFIED), and the link only exists after publishing.
The link is recorded in write-pipeline/postpublish.json and rendered into an unbound paste copy (write-pipeline/paste-copy.md and .html),
directly under the hero image caption, only when a link exists and the story is paywalled.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import frame as FR
from . import mdlib as M
from .core import atomic_write, now

RECORD = Path("write-pipeline") / "postpublish.json"
PASTE_MD = Path("write-pipeline") / "paste-copy.md"
PASTE_HTML = Path("write-pipeline") / "paste-copy.html"
LINE = "*Not a member? Read it free with my [friend link]({url}).*"
WHERE = "directly under the hero image caption"
_HERO_RE = re.compile(r"^!\[[^\]]*\]\([^)]*\)\s*$")
_CAPTION_RE = re.compile(r"^\*[^*].*\*\s*$")


def validate_url(url: str | None) -> str | None:
    """Why `url` is not a Medium story URL with a friend token, else None."""
    if not url or not url.strip():
        return "no URL"
    try:
        u = urlparse(url.strip())
    except ValueError:
        return "not a URL"
    host = (u.hostname or "").lower()
    if u.scheme != "https" or not (host == "medium.com" or host.endswith(".medium.com")):
        return "not an https medium.com URL"
    if len([p for p in u.path.split("/") if p]) < 1 or u.path.strip("/") in ("", "m", "me"):
        return "not a story URL"
    if not parse_qs(u.query).get("sk", [""])[0].strip():
        return "no friend token (sk=) in the URL"
    return None


def friend_line(url: str) -> str:
    return LINE.format(url=url.strip())


def render_paste_copy(final_md: str, line: str) -> str:
    """FINAL.md text with `line` as its own paragraph right after the hero image caption. Raises ValueError when no hero caption is found."""
    lines = final_md.split("\n")
    for i, ln in enumerate(lines):
        if _HERO_RE.match(ln):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and _CAPTION_RE.match(lines[j]):
                return "\n".join(lines[:j + 1] + ["", line] + lines[j + 1:])
            break
    raise ValueError("no hero image caption found in FINAL.md")


def record(pkg: Path, url: str | None, paywalled: bool) -> dict:
    """Validate, write postpublish.json (and the paste copy when the line applies). Returns {ok, line, where, reason, record}."""
    pkg = Path(pkg)
    reason = None if paywalled else "story is not paywalled"
    bad = validate_url(url)
    if bad and paywalled:
        reason = bad
    elif bad and not paywalled:
        reason = f"story is not paywalled; {bad}"
    link = url.strip() if url and not bad else None
    rec = {"friend_link": link, "paywalled": paywalled, "recorded_at": now()}
    if reason:
        rec["omitted_reason"] = reason
    atomic_write(pkg / RECORD, (json.dumps(rec, indent=1, sort_keys=True) + "\n").encode())
    out = {"ok": reason is None, "line": None, "where": None, "reason": reason, "record": str(pkg / RECORD)}
    if reason is None:
        out["line"], out["where"] = friend_line(link), WHERE
        build_paste_copy(pkg)
    return out


def build_paste_copy(pkg: Path) -> Path | None:
    """Write the paste copy from FINAL.md plus the friend line when postpublish.json has a link and paywalled is true; else None. FINAL.md is only read."""
    pkg = Path(pkg)
    try:
        rec = json.loads((pkg / RECORD).read_text())
    except (OSError, ValueError):
        return None
    if not (isinstance(rec, dict) and rec.get("friend_link") and rec.get("paywalled") is True and not validate_url(rec["friend_link"])):
        return None
    text = (pkg / "FINAL.md").read_text()
    out = render_paste_copy(text, friend_line(rec["friend_link"]))
    title, _, _ = M.title_subtitle(text)
    atomic_write(pkg / PASTE_MD, out.encode())
    atomic_write(pkg / PASTE_HTML, FR.to_html(out, title or pkg.name).encode())
    return pkg / PASTE_MD


def cmd(a) -> int:
    if a.sub != "friendlink":
        return 2
    pw = {"yes": True, "no": False}[a.paywalled]
    try:
        r = record(a.package, a.url, pw)
    except (OSError, ValueError) as e:
        print(json.dumps({"ok": False, "reason": str(e)}))
        return 1
    if r["line"]:
        print(r["line"])
        print(f"place it {r['where']}; saved paste copy: {a.package / PASTE_MD}")
    else:
        print(f"nothing to paste: {r['reason']} (recorded in {r['record']})")
    return 1 if (pw and not r["ok"]) else 0  # a paywalled story with an unusable link is an error; a free story needs no line
