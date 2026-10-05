"""Deterministic checks (no LLM). Each finding: {id, bucket, severity, message, evidence, fixable}.

bucket: hard_policy_risk | warning. severity: error | warn | info.
These are advisory signals for the reviewer prompt and the scorecard, not verdicts.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

from scripts.fingerprint_eval.refs import find_refs
from scripts.fingerprint_eval.textutil import SENT_SPLIT_RE, parse_blocks

IMG_LINE = re.compile(r"!\[([^\]]*)\]\(([^)\s]*)(?:\s+\"[^\"]*\")?\)")
LINK = re.compile(r"(?<!!)\[([^\]]*)\]\(([^)]*)\)")
HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
CREDIT_RE = re.compile(r"(?i)\b(photo|image|illustration|credit|courtesy|source|via|generated)\b|©")
GENERIC_ALT = re.compile(r"(?i)^(image|img|photo|picture|screenshot|untitled|figure|alt|image\s*\d*|img[_-]?\d+)$")
URL_RE = re.compile(r"https?://[^\s)>\]\"']+")

WORDS_MIN, WORDS_MAX = 700, 3500
TITLE_MAX, SUBTITLE_MAX, TITLE_MIN, TAG_MAX, TAG_LEN = 100, 140, 20, 5, 25
CLICKBAIT = ["you won't believe", "you wont believe", "shocking", "will blow your mind", "blow your mind", "the truth about",
             "what happens next", "one weird trick", "this one trick", "nobody tells you", "dead wrong", "doctors hate",
             "going viral", "secret they", "won't tell you", "will shock you", "changed my life", "number \\d+ will"]
FORMULAIC = ["in this article", "in today's fast-paced", "delve into", "let's dive", "in conclusion", "game-changer",
             "game changer", "unlock the", "ultimate guide", "in the ever-evolving", "it's important to note", "tapestry",
             "at the end of the day", "without further ado", "buckle up", "here's the thing"]
PROMO = ["subscribe", "follow me", "click here", "link in bio", "sign up", "join my", "newsletter", "buy now", "limited time",
         "free download", "my course", "check out my"]
TRACKING = re.compile(r"(?i)[?&](utm_[a-z]+|ref|aff|affiliate|tag|gclid|fbclid|mc_cid)=")


def f(id_, bucket, severity, message, evidence=None, fixable=False) -> dict:
    return {"id": id_, "bucket": bucket, "severity": severity, "message": message,
            "evidence": evidence if evidence is not None else [], "fixable": fixable}


def scan_lines(md: str):
    """Yield (index, line, in_code). Fence lines count as code."""
    fence = False
    for i, line in enumerate(md.replace("\r\n", "\n").split("\n")):
        if line.lstrip().startswith("```") or line.lstrip().startswith("~~~"):
            fence = not fence
            yield i, line, True
        else:
            yield i, line, fence


def prose_lines(md: str) -> list[tuple[int, str]]:
    return [(i, ln) for i, ln, code in scan_lines(md) if not code]


def norm_url(u: str) -> str:
    u = u.strip().rstrip(".,;:")
    try:
        s = urlsplit(u)
    except ValueError:
        return u
    q = "&".join(p for p in s.query.split("&") if p and not p.lower().startswith("utm_"))
    return f"{s.scheme.lower()}://{s.netloc.lower()}{s.path.rstrip('/')}{'?' + q if q else ''}"


def word_count(md: str) -> int:
    text = "\n".join(b.text for b in parse_blocks(md) if b.kind not in ("code", "image"))
    return len(re.findall(r"[A-Za-z0-9']+", text))


def title_and_subtitle(md: str) -> tuple[str | None, str | None]:
    lines = prose_lines(md)
    title, ti = None, -1
    for i, ln in lines:
        m = HEADING.match(ln)
        if m and len(m.group(1)) == 1:
            title, ti = m.group(2), i
            break
    if title is None:
        return None, None
    sub = None
    seen = 0
    for i, ln in lines:
        if i <= ti or not ln.strip():
            continue
        s = ln.strip()
        if re.fullmatch(r"(\*|_)(?!\1).+\1", s) and not s.startswith("**"):
            sub = s.strip("*_")
            break
        hm = HEADING.match(s)
        if hm and len(hm.group(1)) == 2 and seen == 0:
            sub = hm.group(2)
            break
        seen += 1
        if seen > 4:
            break
    return title, sub


def parse_tags(version: dict, workflow: dict) -> dict[str, list[str] | None]:
    out: dict[str, list[str] | None] = {"version.json": None, "workflow.json": None}
    for name, d in (("version.json", version), ("workflow.json", workflow)):
        for k in ("tags", "topics", "mediumTags"):
            v = d.get(k)
            if isinstance(v, list):
                out[name] = [str(x) for x in v]
                break
            if isinstance(v, str):
                out[name] = [t for t in re.split(r"[,;]", v)]
                break
    return out


def normalize_tags(tags: list[str]) -> list[str]:
    seen, res = set(), []
    for t in tags:
        t = " ".join(str(t).split())
        if t and t.lower() not in seen:
            seen.add(t.lower())
            res.append(t)
    return res[:TAG_MAX]


def load_provenance(package: Path, version: dict) -> dict[str, dict]:
    """{image basename: {credit, source, provenance}} from version.json and assets/**/*.json manifests."""
    import json
    out: dict[str, dict] = {}
    pathkeys, creditkeys = ("path", "file", "filename", "src", "name", "local_path", "asset"), ("credit", "credit_line", "attribution", "photographer", "author")
    srckeys = ("source", "source_url", "origin", "license", "provenance", "generator", "model")

    def walk(o):
        if isinstance(o, dict):
            low = {k.lower(): v for k, v in o.items()}
            p = next((low[k] for k in pathkeys if isinstance(low.get(k), str) and re.search(r"\.(png|jpe?g|gif|webp|svg)$", low[k], re.I)), None)
            cr = next((str(low[k]) for k in creditkeys if low.get(k)), None)
            sr = next((str(low[k]) for k in srckeys if low.get(k)), None)
            if p and (cr or sr):
                out[Path(p).name] = {"credit": cr, "source": sr}
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(version)
    for jf in list((package / "assets").glob("**/*.json"))[:50] if (package / "assets").is_dir() else []:
        try:
            walk(json.loads(jf.read_text()))
        except (OSError, ValueError):
            pass
    return out


def credit_text(prov: dict) -> str | None:
    return prov.get("credit") or prov.get("source")


def has_credit_near(lines: list[str], idx: int, prov: dict | None) -> bool:
    window = [lines[j] for j in range(max(0, idx - 1), min(len(lines), idx + 4)) if j != idx]
    needle = (credit_text(prov) or "").lower() if prov else ""
    for w in window:
        if needle and needle in w.lower():
            return True
        if CREDIT_RE.search(w) and not w.lstrip().startswith("!["):
            return True
    return False


def source_note_links(text: str) -> dict[str, str]:
    """{normalized url: label} from a source-notes file."""
    out: dict[str, str] = {}
    for m in LINK.finditer(text):
        for u in URL_RE.findall(m.group(2)):
            out.setdefault(norm_url(u), m.group(1).strip())
    for u in URL_RE.findall(text):
        out.setdefault(norm_url(u), "")
    return out


def run_checks(md: str, package: Path | None = None, version: dict | None = None, workflow: dict | None = None,
               source_notes: Path | None = None) -> dict:
    version, workflow = version or {}, workflow or {}
    F: list[dict] = []
    lines = md.replace("\r\n", "\n").split("\n")
    pl = prose_lines(md)
    title, subtitle = title_and_subtitle(md)
    words = word_count(md)
    refs = find_refs(md)

    # length band
    if words < WORDS_MIN:
        F.append(f("length_short", "warning", "warn", f"{words} words is under the {WORDS_MIN} band", [str(words)]))
    elif words > WORDS_MAX:
        F.append(f("length_long", "warning", "warn", f"{words} words is over the {WORDS_MAX} band", [str(words)]))

    # title / subtitle
    if not title:
        F.append(f("title_missing", "warning", "error", "no H1 title found"))
    else:
        if len(title) > TITLE_MAX:
            F.append(f("title_long", "warning", "warn", f"title is {len(title)} chars (>{TITLE_MAX})", [title]))
        if len(title) < TITLE_MIN:
            F.append(f("title_short", "warning", "warn", f"title is {len(title)} chars (<{TITLE_MIN})", [title]))
        if title.rstrip().endswith("?"):
            F.append(f("title_question", "warning", "info", "question title (formula risk)", [title]))
        if re.match(r"^\s*\d+\s", title) or re.search(r"(?i)\b\d+\s+(ways|things|reasons|tips|lessons|signs|mistakes|rules|secrets|habits)\b", title):
            F.append(f("title_listicle", "warning", "warn", "listicle-number title", [title]))
        low = title.lower()
        hits = [c for c in CLICKBAIT if re.search(c, low)]
        if hits:
            F.append(f("title_clickbait", "warning", "warn", "clickbait phrase in title", hits))
        caps = [w for w in re.findall(r"[A-Za-z]{4,}", title) if w.isupper()]
        letters = [c for c in title if c.isalpha()]
        if caps or (letters and sum(c.isupper() for c in letters) / len(letters) > 0.5):
            F.append(f("title_all_caps", "warning", "warn", "ALL CAPS in title", caps or [title]))
        if "!" in title:
            F.append(f("title_exclaim", "warning", "info", "exclamation mark in title", [title]))
        if " | " in title:
            F.append(f("title_pipe_suffix", "warning", "info", "title carries a ' | ' suffix (publication tag leaking into the title?)", [title]))
    if title and not subtitle:
        F.append(f("subtitle_missing", "warning", "warn", "no subtitle found under the title"))
    elif subtitle and len(subtitle) > SUBTITLE_MAX:
        F.append(f("subtitle_long", "warning", "warn", f"subtitle is {len(subtitle)} chars (>{SUBTITLE_MAX})", [subtitle]))

    # headings
    heads = [(i, len(m.group(1)), m.group(2)) for i, ln in pl if (m := HEADING.match(ln))]
    h1 = [h for h in heads if h[1] == 1]
    if len(h1) > 1:
        F.append(f("heading_multiple_h1", "warning", "warn", f"{len(h1)} H1 headings (expected 1)", [h[2] for h in h1]))
    prev = 0
    for i, lvl, txt in heads:
        if prev and lvl > prev + 1:
            F.append(f("heading_skip", "warning", "warn", f"heading level jumps H{prev} -> H{lvl}", [txt]))
        prev = lvl
    if words > 600 and len([h for h in heads if h[1] >= 2]) == 0:
        F.append(f("heading_none", "warning", "warn", "long article with no section headings"))
    dup_h = [t for t, n in Counter(h[2].lower() for h in heads).items() if n > 1]
    if dup_h:
        F.append(f("heading_duplicate", "warning", "warn", "duplicate headings", dup_h))

    # duplicates
    paras = [b.text for b in parse_blocks(md) if b.kind == "paragraph" and len(b.text) >= 40]
    c = Counter(" ".join(p.split()).lower() for p in paras)
    dups = [p for p, n in c.items() if n > 1]
    if dups:
        F.append(f("duplicate_paragraph", "hard_policy_risk", "error", "exact duplicated paragraphs", [d[:100] for d in dups], True))
    sents = []
    for p in paras:
        sents.extend(s.strip() for s in SENT_SPLIT_RE.split(p) if len(s.strip()) >= 40)
    sc = Counter(" ".join(s.split()).lower() for s in sents)
    sd = [s for s, n in sc.items() if n > 1 and s not in dups and not any(s in d for d in dups)]
    if sd:
        F.append(f("duplicate_sentence", "warning", "warn", "repeated sentences", [s[:100] for s in sd], True))

    # images: alt + credit
    imgs: list[tuple[int, str, str]] = []
    for i, ln in pl:
        for m in IMG_LINE.finditer(ln):
            imgs.append((i, m.group(1), m.group(2)))
    ref_imgs = [m for m in refs["images"] if "][" in m]
    for m in ref_imgs:
        alt = re.match(r"!\[([^\]]*)\]", m).group(1)
        if not alt.strip():
            F.append(f("alt_missing", "hard_policy_risk", "error", "image with empty ALT text (reference style)", [m]))
    prov = load_provenance(package, version) if package else {}
    for i, alt, src in imgs:
        a = alt.strip()
        if not a:
            F.append(f("alt_missing", "hard_policy_risk", "error", f"image without ALT text: {src}", [src], True))
        elif GENERIC_ALT.match(a) or re.fullmatch(r"[\w-]+\.(png|jpe?g|gif|webp)", a, re.I):
            F.append(f("alt_generic", "warning", "warn", f"ALT text is a placeholder: {a!r}", [src], True))
        elif len(a) > 250:
            F.append(f("alt_long", "warning", "info", f"ALT text is {len(a)} chars", [src]))
        p = prov.get(Path(src).name)
        if p and not has_credit_near(lines, i, p):
            F.append(f("image_credit_missing", "warning", "warn", f"image has recorded provenance but no credit line: {src}", [src, str(credit_text(p))], True))
    if imgs and not prov:
        F.append(f("image_provenance_unknown", "warning", "info", "no provenance recorded for images; credit not checkable", [str(len(imgs))]))

    # formatting
    fmt: list[str] = []
    for i, ln in pl:
        if re.match(r"^#{1,6}[^#\s]", ln):
            fmt.append(f"L{i + 1}: heading without space")
        if ln.count("**") % 2 == 1:
            fmt.append(f"L{i + 1}: unbalanced **")
        if re.search(r"(?<!\\)<(?!https?://|mailto:)[a-zA-Z/][^>]*>", ln):
            fmt.append(f"L{i + 1}: raw HTML")
        if re.search(r"&(nbsp|amp|lt|gt|quot);|\\n", ln):
            fmt.append(f"L{i + 1}: literal entity/escape")
        if re.match(r"^\s*\|.*\|\s*$", ln):
            fmt.append(f"L{i + 1}: markdown table (Medium does not render tables)")
    if re.search(r"\n{4,}", md):
        fmt.append("3+ consecutive blank lines")
    if fmt:
        F.append(f("formatting", "warning", "warn", "stray markdown / formatting issues", fmt, True))
    ph = [ln.strip()[:80] for _, ln in pl if re.search(r"(?i)\b(TODO|TBD|FIXME|lorem ipsum)\b|\[citation needed\]|\{\{|\}\}", ln)]
    if ph:
        F.append(f("placeholder_text", "hard_policy_risk", "error", "placeholder text left in article", ph))

    # links
    ts, empty = [], []
    for i, ln in pl:
        for m in LINK.finditer(ln):
            text, url = m.group(1).strip(), m.group(2).strip().split(" ")[0]
            if not url or url == "#" or not text:
                empty.append(f"L{i + 1}: [{text}]({url})")
            if re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", text) or (re.search(r"(?i)(youtu\.be|youtube\.com)", url) and re.search(r"[?&]t=\d", url)):
                ts.append(f"L{i + 1}: [{text}]({url})")
    if empty:
        F.append(f("link_empty", "warning", "error", "empty or placeholder links", empty, True))
    if ts:
        F.append(f("link_timestamp", "warning", "warn", "timestamp links (clip-style attribution)", ts, True))
    all_urls = {norm_url(u) for u in URL_RE.findall("\n".join(ln for _, ln in pl))}
    tracked = [u for u in URL_RE.findall("\n".join(ln for _, ln in pl)) if TRACKING.search(u)]
    if tracked:
        F.append(f("link_tracking", "hard_policy_risk", "warn", "tracking/affiliate-style query params on links", tracked[:8]))
    if source_notes and source_notes.exists():
        notes = source_note_links(source_notes.read_text())
        missing = [f"{lbl or '(no label)'} {u}" for u, lbl in notes.items() if u not in all_urls]
        if missing:
            F.append(f("source_link_missing", "warning", "warn", "links in source-notes absent from the article", missing, True))
        unknown = sorted(u for u in all_urls if u not in notes and not re.search(r"(?i)medium\.com|maxpetrusenko\.com|linkedin|github\.com/maxpetrusenko", u))
        if unknown:
            F.append(f("link_not_in_source_notes", "warning", "info", "article links not recorded in source-notes", unknown[:12]))
    elif package is not None and not refs["links"]:
        F.append(f("no_links_at_all", "warning", "warn", "article has no outbound links or sources"))

    # generic/formulaic + content-marketing/traffic-harvesting signals
    prose = "\n".join(ln for _, ln in pl).lower()
    fm = [p for p in FORMULAIC if p in prose]
    if fm:
        F.append(f("formulaic_phrases", "warning", "warn", "stock/formulaic phrases", fm))
    promo = [p for p in PROMO if p in prose]
    if promo:
        F.append(f("promo_language", "warning", "warn", "promotional/CTA language (content-marketing risk)", promo))
    ext_links = len([u for u in refs["links"] if "http" in u])
    if words and ext_links / max(words, 1) * 1000 > 25:
        F.append(f("link_density_high", "warning", "warn", f"{ext_links} links in {words} words", [str(ext_links)]))
    toks = [w for w in re.findall(r"[a-z]{5,}", prose)]
    if len(toks) > 200:
        top, n = Counter(toks).most_common(1)[0]
        if n / len(toks) > 0.04:
            F.append(f("keyword_stuffing", "warning", "warn", f"{top!r} is {n / len(toks):.1%} of long words", [top]))

    # tags
    tg = parse_tags(version, workflow)
    present = {k: v for k, v in tg.items() if v is not None}
    if package is not None and (version or workflow):
        if not present or all(not normalize_tags(v) for v in present.values()):
            F.append(f("tags_missing", "warning", "warn", "no tags/topics recorded in version.json or workflow.json"))
        for k, v in present.items():
            n = normalize_tags(v) if v else []
            if len([t for t in v if str(t).strip()]) > TAG_MAX:
                F.append(f("tags_over_limit", "hard_policy_risk", "error", f"{k}: {len(v)} tags (max {TAG_MAX})", v, True))
            if len(n) != len([t for t in v if str(t).strip()]) and len(v) <= TAG_MAX:
                F.append(f("tags_duplicate", "warning", "warn", f"{k}: duplicate/blank tags", v, True))
            long_ = [t for t in v if len(str(t)) > TAG_LEN]
            if long_:
                F.append(f("tag_too_long", "warning", "warn", f"{k}: tag over {TAG_LEN} chars", long_))
        if len(present) == 2 and {t.lower() for t in normalize_tags(present["version.json"])} != {t.lower() for t in normalize_tags(present["workflow.json"])}:
            F.append(f("tags_mismatch", "warning", "warn", "version.json and workflow.json tags differ", [str(present["version.json"]), str(present["workflow.json"])], True))

    metrics = {"words": words, "reading_minutes": round(words / 265, 1), "images": len(refs["images"]), "links": len(refs["links"]),
               "headings": len(heads), "title": title, "subtitle": subtitle, "title_chars": len(title or ""), "subtitle_chars": len(subtitle or "")}
    return {"findings": F, "metrics": metrics}
