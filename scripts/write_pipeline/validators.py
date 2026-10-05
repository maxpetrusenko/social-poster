"""Artifact validators for the agent-run stages. Each returns {"ok": bool, "reasons": [...], ...}; none calls a model."""
from __future__ import annotations

import re
import struct
from collections import Counter
from pathlib import Path

from . import mdlib as M
from .core import sha_bytes, sha_file

SOURCE_KINDS = {"url", "text", "transcript", "draft", "note", "author"}
CLAIM_STATUS = {"supported", "attributed", "inference", "unresolved"}
CONTRIB_KINDS = {"analysis", "comparison", "evidence", "synthesis", "author_experience"}
IMG_METHODS = {"generated", "sourced", "diagram", "screenshot", "own_photo"}
BAD_LICENSE = {"", "unknown", "n/a", "na", "tbd", "none", "unlicensed"}
MIN_TITLES, SUBTITLE_MAX = 10, 140
HERO_MIN_W, HERO_MIN_H, MAX_BYTES = 1200, 600, 8_000_000
CONTRAST = re.compile(r"\bnot\b[^.?!]{0,60}\b(?:but|it'?s|it is)\b|\b(?:isn't|aren't|wasn't|doesn't|don't)\b[^.?!]{0,60}[;,.]\s*(?:it|they)|\bless about\b|^forget\b|\bnever the (?:issue|problem)\b", re.I)
CLICKBAIT = re.compile(r"you won'?t believe|one (?:weird )?trick|shocking|game.?changer|ultimate guide|everything you need to know|the truth about|secret|will blow your mind|\bhere'?s (?:why|the)", re.I)
VIDEO_FRAME = re.compile(r"video frame|thumbnail|presenter|talking head|speaker|screenshot of (?:the )?video|youtube frame|still from", re.I)
STOP = set("the a an of to in on for and or with from by is are was were be as at it this that these those your you how what why when".split())


def _req(d: dict, keys: tuple[str, ...], where: str, reasons: list[str]) -> None:
    for k in keys:
        if d.get(k) in (None, "", [], {}):
            reasons.append(f"{where}: '{k}' missing or empty")


def sources(data: dict, pkg: Path) -> dict:
    reasons: list[str] = []
    items = data.get("sources")
    if not isinstance(items, list) or not items:
        return {"ok": False, "reasons": ["sources: at least one source entry is required"]}
    seen, captured = set(), 0
    for i, s in enumerate(items):
        where = f"sources[{i}]"
        _req(s, ("id", "kind", "status"), where, reasons)
        if s.get("id") in seen:
            reasons.append(f"{where}: duplicate id {s.get('id')!r}")
        seen.add(s.get("id"))
        if s.get("kind") not in SOURCE_KINDS:
            reasons.append(f"{where}: kind must be one of {sorted(SOURCE_KINDS)}")
        if s.get("status") == "captured":
            f = pkg / str(s.get("file", ""))
            if not s.get("file") or not f.is_file() or not f.read_bytes().strip():
                reasons.append(f"{where}: captured source file missing or empty: {s.get('file')!r}")
            else:
                s["sha256"] = sha_file(f)
                captured += 1
            if s.get("kind") == "url":
                _req(s, ("url", "captured_at", "method"), where, reasons)
        elif s.get("status") == "blocked":
            _req(s, ("blocker",), where, reasons)
        else:
            reasons.append(f"{where}: status must be captured or blocked")
    if reasons:
        return {"ok": False, "reasons": reasons}
    if captured == 0:
        return {"ok": False, "blocked": "BLOCKED_INPUT", "reasons": ["every supplied source is blocked: " + "; ".join(str(s.get("blocker")) for s in items)]}
    return {"ok": True, "reasons": [], "data": data}


def source_blob(data: dict, pkg: Path) -> str:
    out = []
    for s in data.get("sources", []):
        if s.get("status") == "captured":
            try:
                out.append((pkg / s["file"]).read_text(errors="ignore"))
            except OSError:
                pass
    return "\n".join(out)


def known_urls(src: dict, ev: dict) -> set[str]:
    urls = set()
    for s in src.get("sources", []):
        if s.get("url"):
            urls.add(str(s["url"]).rstrip("/"))
    for c in ev.get("claims", []):
        for e in c.get("evidence", []) or []:
            if e.get("url"):
                urls.add(str(e["url"]).rstrip("/"))
    return urls


def blob_numbers(src_blob: str, ev: dict) -> Counter:
    text = src_blob + "\n" + " ".join(str(c.get("claim", "")) + " " + str(c.get("supported_wording", "")) + " " + " ".join(str(e.get("passage", "")) for e in c.get("evidence", []) or [])
                                       for c in ev.get("claims", []))
    return M.significant_numbers(text)


def evidence(data: dict, src: dict) -> dict:
    reasons: list[str] = []
    claims = data.get("claims")
    if not isinstance(claims, list) or not claims:
        return {"ok": False, "reasons": ["evidence: a claims list is required"]}
    ids = {s.get("id") for s in src.get("sources", [])}
    seen = set()
    for i, c in enumerate(claims):
        w = f"claims[{i}]"
        _req(c, ("id", "claim", "status"), w, reasons)
        if c.get("id") in seen:
            reasons.append(f"{w}: duplicate id")
        seen.add(c.get("id"))
        if c.get("status") not in CLAIM_STATUS:
            reasons.append(f"{w}: status must be one of {sorted(CLAIM_STATUS)}")
        if c.get("status") in ("supported", "attributed"):
            ev = c.get("evidence") or []
            good = [e for e in ev if e.get("passage") and (str(e.get("url", "")).startswith(("http://", "https://")) or e.get("source_id") in ids)]
            if not good:
                reasons.append(f"{w} ({c.get('id')}): {c.get('status')} claim has no inspected source with url or source_id and passage (missing source)")
            _req(c, ("supported_wording",), w, reasons)
    if not str(data.get("research_delta", "")).strip():
        reasons.append("evidence: research_delta (what research added, corrected or ruled out) is required")
    return {"ok": not reasons, "reasons": reasons, "data": data}


def angle(data: dict, ev: dict, src: dict) -> dict:
    reasons: list[str] = []
    _req(data, ("question", "reader", "angle", "verdict"), "angle", reasons)
    ids = {c.get("id") for c in ev.get("claims", [])}
    author = any(s.get("kind") == "author" and s.get("status") == "captured" for s in src.get("sources", []))
    for i, c in enumerate(data.get("contributions") or []):
        w = f"contributions[{i}]"
        _req(c, ("id", "text", "kind"), w, reasons)
        if c.get("kind") not in CONTRIB_KINDS:
            reasons.append(f"{w}: kind must be one of {sorted(CONTRIB_KINDS)}")
        if c.get("kind") == "author_experience" and not author:
            reasons.append(f"{w}: author_experience needs author-supplied material in the source manifest; list it under author_opportunities instead")
        bad = [e for e in c.get("evidence_ids") or [] if e not in ids]
        if bad:
            reasons.append(f"{w}: unknown evidence ids {bad}")
        if c.get("kind") != "author_experience" and not (c.get("evidence_ids") or []):
            reasons.append(f"{w}: a contribution must cite evidence ids")
    for i, o in enumerate(data.get("author_opportunities") or []):
        _req(o, ("id", "prompt", "why"), f"author_opportunities[{i}]", reasons)
    if data.get("verdict") not in ("adds", "summary_only"):
        reasons.append("angle: verdict must be 'adds' or 'summary_only'")
    if data.get("verdict") == "adds" and not data.get("contributions"):
        reasons.append("angle: verdict 'adds' needs at least one contribution beyond a summary")
    if reasons:
        return {"ok": False, "reasons": reasons}
    if data["verdict"] == "summary_only":
        return {"ok": True, "reasons": [], "data": data, "terminal": ("NOT_READY", "contribution test failed: the article would only summarize the source; see author_opportunities")}
    return {"ok": True, "reasons": [], "data": data}


def outline(data: dict, ev: dict) -> dict:
    reasons: list[str] = []
    secs = data.get("sections")
    if not isinstance(secs, list) or len(secs) < 2:
        return {"ok": False, "reasons": ["outline: at least two sections are required"]}
    ids = {c.get("id") for c in ev.get("claims", [])}
    heads = [M.norm(str(s.get("heading", ""))) for s in secs]
    if len(set(heads)) != len(heads):
        reasons.append("outline: duplicate section headings (merge sections that restate one point)")
    for i, s in enumerate(secs):
        _req(s, ("heading", "purpose"), f"sections[{i}]", reasons)
        bad = [e for e in s.get("evidence_ids") or [] if e not in ids]
        if bad:
            reasons.append(f"sections[{i}]: unknown evidence ids {bad}")
    return {"ok": not reasons, "reasons": reasons, "data": data}


def text_basic(text: str, *, src: dict, urls: set[str], require_h1: bool = True) -> list[str]:
    reasons = list(M.lint_v6(text))
    if require_h1 and M.title_subtitle(text)[0] is None:
        reasons.append("the text must start with a single H1 title")
    if not text.strip():
        reasons.append("empty text")
    extra = {u for u in M.link_urls(text) if u not in urls}
    if extra:
        reasons.append(f"link not in the source or evidence set (missing source): {sorted(extra)[:3]}")
    if M.EXPERIENCE.search(M.strip_code(text)) and not any(s.get("kind") == "author" and s.get("status") == "captured" for s in src.get("sources", [])):
        reasons.append("first-person experience claim but no author-supplied material in the source manifest (record an AUTHOR OPPORTUNITY)")
    return reasons


def unsupported_numbers(text: str, allowed: Counter) -> list[str]:
    bad = [k for k in M.significant_numbers(text) if k not in allowed]
    return [f"number not found in the sources or evidence: {sorted(bad)[:5]}"] if bad else []


def factual_report(report: dict, text: str, ev: dict) -> list[str]:
    reasons: list[str] = []
    if not isinstance(report.get("checked"), list) or not report["checked"]:
        reasons.append("factual report: a 'checked' list is required")
    n = M.norm(text)
    for c in ev.get("claims", []):
        if c.get("status") == "unresolved":
            for frag in (c.get("claim"), c.get("supported_wording")):
                if frag and len(str(frag)) > 25 and M.norm(str(frag)) in n:
                    reasons.append(f"unresolved claim {c.get('id')} is still asserted in the text: remove or narrow it")
                    break
    return reasons


def titles(data: dict, body: str) -> dict:
    reasons: list[str] = []
    cands = data.get("candidates")
    if not isinstance(cands, list) or any(not isinstance(c, str) for c in cands):
        return {"ok": False, "reasons": ["titles: 'candidates' must be a list of strings"]}
    uniq = {M.norm(c) for c in cands}
    if len(uniq) < MIN_TITLES:
        reasons.append(f"titles: {len(uniq)} distinct candidates, need at least {MIN_TITLES}")
    pick, sub = str(data.get("pick", "")), str(data.get("subtitle", ""))
    if pick not in cands:
        reasons.append("titles: 'pick' must be one of the candidates")
    if not str(data.get("rationale", "")).strip():
        reasons.append("titles: a rationale for the pick is required")
    if not sub.strip():
        reasons.append("titles: subtitle is required")
    if len(sub) > SUBTITLE_MAX:
        reasons.append(f"titles: subtitle is {len(sub)} chars, limit {SUBTITLE_MAX}")
    body_tokens = {w for w in re.findall(r"[a-z0-9']+", M.norm(body)) if w not in STOP}
    for label, t in (("title", pick), ("subtitle", sub)):
        if not t:
            continue
        if "—" in t:
            reasons.append(f"weak {label}: em dash")
        if CONTRAST.search(t):
            reasons.append(f"weak {label}: corrective contrast construction")
        if CLICKBAIT.search(t):
            reasons.append(f"weak {label}: unsupported hype or withheld answer")
        if t.strip().endswith("?"):
            reasons.append(f"weak {label}: question used to stage a reveal")
        toks = {w for w in re.findall(r"[a-z0-9']+", M.norm(t)) if w not in STOP and len(w) > 3}
        if len(toks & body_tokens) < min(2, len(toks)) or not toks:
            reasons.append(f"weak {label}: names a subject the body does not cover")
        bad = [n for n in M.significant_numbers(t) if n not in M.significant_numbers(body)]
        if bad:
            reasons.append(f"weak {label}: number {bad[:2]} is not supported by the body")
    if pick and not (8 <= len(pick) <= 100):
        reasons.append("weak title: length must be 8 to 100 characters")
    if pick and sub:
        a, b = set(M.norm(pick).split()), set(M.norm(sub).split())
        if a and len(a & b) / len(a | b) > 0.7:
            reasons.append("weak subtitle: repeats the title instead of adding scope or stakes")
        if len(sub) < 25:
            reasons.append("weak subtitle: too short to add scope")
    return {"ok": not reasons, "reasons": reasons, "data": data}


def image_size(b: bytes) -> tuple[int, int] | None:
    if b[:8] == b"\x89PNG\r\n\x1a\n" and len(b) >= 24:
        return struct.unpack(">II", b[16:24])
    if b[:6] in (b"GIF87a", b"GIF89a") and len(b) >= 10:
        return struct.unpack("<HH", b[6:10])
    if b[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return None


def images(data: dict, pkg: Path, body: str) -> dict:
    reasons: list[str] = []
    imgs = data.get("images")
    if not isinstance(imgs, list):
        return {"ok": False, "reasons": ["images: 'images' must be a list"]}
    if not imgs:
        if not str(data.get("waived_reason", "")).strip():
            return {"ok": False, "reasons": ["images: no images and no waived_reason; add a hero image or state why none fits"]}
        return {"ok": True, "reasons": [], "data": data}
    heads = {M.norm(b.text.lstrip("# ").strip()) for b in M.blocks(body) if b.kind == "heading"}
    n_par = sum(1 for b in M.blocks(body) if b.kind == "paragraph")
    heroes, hashes = 0, set()
    for i, im in enumerate(imgs):
        w = f"images[{i}]"
        _req(im, ("id", "path", "purpose", "placement", "method", "provenance", "license", "caption", "alt"), w, reasons)
        if im.get("method") not in IMG_METHODS:
            reasons.append(f"{w}: method must be one of {sorted(IMG_METHODS)}")
        if str(im.get("license", "")).strip().lower() in BAD_LICENSE:
            reasons.append(f"{w}: license is missing or unknown (missing image provenance)")
        if im.get("method") == "sourced" and not str(im.get("source_url", "")).startswith(("http://", "https://")):
            reasons.append(f"{w}: a sourced image needs source_url")
        if im.get("is_video_frame") or im.get("contains_presenter") or VIDEO_FRAME.search(" ".join(str(im.get(k, "")) for k in ("purpose", "provenance", "path", "method"))):
            reasons.append(f"{w}: presenter and video frames are not allowed")
        alt = str(im.get("alt", ""))
        if alt and not (10 <= len(alt) <= 220):
            reasons.append(f"{w}: alt text must be 10 to 220 characters")
        pl = str(im.get("placement", ""))
        if pl == "hero":
            heroes += 1
        elif pl.startswith("after:"):
            if M.norm(pl[6:]) not in heads:
                reasons.append(f"{w}: placement heading {pl[6:]!r} is not in the body")
        elif pl.startswith("after-paragraph:") and pl[16:].isdigit() and 1 <= int(pl[16:]) <= n_par:
            pass
        elif pl:
            reasons.append(f"{w}: placement must be hero, after:<heading> or after-paragraph:<n>")
        f = pkg / str(im.get("path", ""))
        if not f.is_file():
            reasons.append(f"{w}: file not found: {im.get('path')!r}")
            continue
        b = f.read_bytes()
        im["sha256"] = sha_bytes(b)
        if im["sha256"] in hashes:
            reasons.append(f"{w}: duplicate image bytes")
        hashes.add(im["sha256"])
        dims = image_size(b)
        if dims is None:
            reasons.append(f"{w}: unreadable image (need png, jpeg or gif)")
            continue
        im["width"], im["height"] = dims
        if len(b) > MAX_BYTES:
            reasons.append(f"{w}: file over {MAX_BYTES // 1_000_000} MB")
        if pl == "hero" and (dims[0] < HERO_MIN_W or dims[1] < HERO_MIN_H or not 1.2 <= dims[0] / dims[1] <= 2.4):
            reasons.append(f"{w}: hero image {dims[0]}x{dims[1]} is below the quality bar (>= {HERO_MIN_W}x{HERO_MIN_H}, aspect 1.2 to 2.4)")
        elif pl != "hero" and dims[0] < 800:
            reasons.append(f"{w}: image {dims[0]}x{dims[1]} is below the quality bar (width >= 800)")
    if heroes != 1:
        reasons.append(f"images: exactly one hero is required, found {heroes}")
    return {"ok": not reasons, "reasons": reasons, "data": data}
