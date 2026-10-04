"""Deterministic content repair, grounded only in ctx.reference_path (the rated version). No LLM.

A repairer returns the path of a new `article-healed-<n>.md` (never overwriting) or None when support
cannot be established. It can never mark anything PASS: the caller re-runs the canonical gate on the new bytes.
"""
from __future__ import annotations

import difflib
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from .classify import classify, failure_categories
from .contracts import CONTENT_CATEGORIES, HEALED_PATTERN, Category, EvalRecord, PackageCtx
from .refs import LINK_INLINE, find_refs, lost
from .textutil import Block, parse_blocks, render_blocks, split_sentences, strip_inline

BLOCK_MATCH, SENT_MATCH, HEAD_MATCH = 0.5, 0.6, 0.8


@dataclass
class Sec:
    heading: Block | None
    blocks: list[Block] = field(default_factory=list)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[#*_`]", "", strip_inline(s))).strip().lower()


def _ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b), autojunk=False).ratio()


def _copy(b: Block) -> Block:
    return Block(b.kind, b.text)


def _idx(lst: list, obj) -> int:
    return next(i for i, x in enumerate(lst) if x is obj)


def _parse(md: str) -> tuple[str, list[Sec]]:
    md = md.replace("\r\n", "\n")
    m = re.match(r"\A---\n.*?\n---\n", md, re.S)
    front, body = (md[: m.end()], md[m.end():]) if m else ("", md)
    secs = [Sec(None)]
    for b in parse_blocks(body):
        if b.kind == "heading":
            secs.append(Sec(b))
        else:
            secs[-1].blocks.append(b)
    return front, secs


def _render(front: str, secs: list[Sec]) -> str:
    blocks: list[Block] = []
    for s in secs:
        if s.heading:
            blocks.append(s.heading)
        blocks.extend(s.blocks)
    return front + render_blocks(blocks)


def _keys(secs: list[Sec]) -> list[tuple[str, int]]:
    seen: dict[str, int] = {}
    out = []
    for s in secs:
        k = _norm(s.heading.text) if s.heading else ""
        out.append((k, seen.get(k, 0)))
        seen[k] = seen.get(k, 0) + 1
    return out


def _align(ref: list[Sec], cand: list[Sec]) -> dict[int, Sec]:
    """ref index -> candidate section: exact heading first, then fuzzy-renamed headings."""
    ck = {k: s for k, s in zip(_keys(cand), cand)}
    match = {i: ck[k] for i, k in enumerate(_keys(ref)) if k in ck}
    used = {id(s) for s in match.values()}
    left = [s for s in cand if s.heading and id(s) not in used]
    for i, rs in enumerate(ref):
        if i in match or not rs.heading or not left:
            continue
        best = max(left, key=lambda s: _ratio(rs.heading.text, s.heading.text))
        if _ratio(rs.heading.text, best.heading.text) >= HEAD_MATCH:
            match[i] = best
            left.remove(best)
    return match


def _paras(sec: Sec) -> list[str]:
    return [re.sub(r"\s+", " ", b.text).strip() for b in sec.blocks if b.kind == "paragraph"]


def _restore_section(ref: list[Sec], cand: list[Sec], match: dict[int, Sec], i: int) -> str:
    rs = ref[i]
    new = Sec(_copy(rs.heading) if rs.heading else None, [_copy(b) for b in rs.blocks])
    name = rs.heading.text if rs.heading else "(intro)"
    if i in match:
        cand[_idx(cand, match[i])] = new
        verb = "restored"
    else:
        pos = 1
        for j in range(i - 1, -1, -1):
            if j in match:
                pos = _idx(cand, match[j]) + 1
                break
        cand.insert(pos, new)
        verb = "re-inserted"
    match[i] = new
    return f"{verb} section {name!r}"


def _name_to_ref(ref: list[Sec], name: str) -> int | None:
    if name.strip().lower() in ("(intro)", ""):
        return 0
    n = _norm(name)
    return next((i for i, s in enumerate(ref) if s.heading and _norm(s.heading.text) == n), None)


def _flagged(record: EvalRecord, verdicts: set[str]) -> list[str]:
    claims = getattr(record, "claims", None) or {}
    return [str(f.get("section", "")) for f in claims.get("flagged") or []
            if isinstance(f, dict) and f.get("verdict") in verdicts]


def _frozen_texts(ref_md: str) -> set[str]:
    try:
        from .guards import frozen_blocks
        return set(frozen_blocks(ref_md))
    except Exception:  # noqa: BLE001  frozen detection is an optimization of precision, not a requirement
        return set()


def _assign(ref_blocks: list[Block], cand_blocks: list[Block]) -> dict[int, Block]:
    """ref block index -> candidate block: exact text first, then best fuzzy match of the same kind."""
    assign: dict[int, Block] = {}
    used: set[int] = set()
    for j, rb in enumerate(ref_blocks):
        for cb in cand_blocks:
            if id(cb) not in used and cb.kind == rb.kind and cb.text == rb.text:
                assign[j] = cb
                used.add(id(cb))
                break
    for j, rb in enumerate(ref_blocks):
        if j in assign:
            continue
        pool = [cb for cb in cand_blocks if id(cb) not in used and cb.kind == rb.kind]
        if pool:
            best = max(pool, key=lambda cb: _ratio(rb.text, cb.text))
            if _ratio(rb.text, best.text) >= BLOCK_MATCH:
                assign[j] = best
                used.add(id(best))
    return assign


# ---- phases: each takes (ref_md, cand_md, record, actions) and returns new cand_md, or raises _Decline -------------------
class _Decline(Exception):
    """Support cannot be established; the whole repair returns None."""


def _phase_added(ref_md: str, cand_md: str, record: EvalRecord, actions: list[str]) -> str:
    _, ref = _parse(ref_md)
    front, cand = _parse(cand_md)
    match = _align(ref, cand)
    inverse = {id(s): i for i, s in match.items()}
    targets: list[Sec] = []
    for name in _flagged(record, {"added", "added_unsupported", "unsupported"}):
        n = _norm(name)
        sec = cand[0] if name.strip().lower() in ("(intro)", "") else next((s for s in cand if s.heading and _norm(s.heading.text) == n), None)
        if sec is not None and sec not in targets:
            targets.append(sec)
    if not targets:
        targets = [match[i] for i in match if _paras(ref[i]) != _paras(match[i])]
        targets += [s for s in cand if s.heading and id(s) not in inverse and _paras(s)]
    if not targets:
        raise _Decline("no section with an unsupported claim could be identified")
    for sec in targets:
        if id(sec) not in inverse:
            raise _Decline(f"section {sec.heading.text if sec.heading else '(intro)'!r} has no counterpart in the reference")
    for sec in targets:
        actions.append(_restore_section(ref, cand, match, inverse[id(sec)]))
    return _render(front, cand)


def _phase_content(ref_md: str, cand_md: str, record: EvalRecord, actions: list[str]) -> str:
    _, ref = _parse(ref_md)
    front, cand = _parse(cand_md)
    match = _align(ref, cand)
    idxs = [i for n in _flagged(record, {"changed", "missing"}) if (i := _name_to_ref(ref, n)) is not None and i in match]
    if not idxs:
        idxs = [i for i in match if _paras(ref[i]) != _paras(match[i])]
    idxs += [i for i, s in enumerate(ref) if i not in match and _paras(s)]  # deleted prose sections
    for i in sorted(set(idxs)):
        actions.append(_restore_section(ref, cand, match, i))
    return _render(front, cand)


def _phase_structure(ref_md: str, cand_md: str, record: EvalRecord, actions: list[str]) -> str:
    frozen = _frozen_texts(ref_md)
    _, ref = _parse(ref_md)
    front, cand = _parse(cand_md)
    match = _align(ref, cand)
    for i, rs in enumerate(ref):
        if i not in match:
            actions.append(_restore_section(ref, cand, match, i))
            continue
        cs = match[i]
        if rs.heading and cs.heading and cs.heading.text != rs.heading.text:
            actions.append(f"restored heading {rs.heading.text!r}")
            cs.heading = _copy(rs.heading)
        assign = _assign(rs.blocks, cs.blocks)
        prev: Block | None = None
        for j, rb in enumerate(rs.blocks):
            structural = rb.kind != "paragraph" or rb.text in frozen
            cb = assign.get(j)
            if cb is not None:
                if structural and cb.text != rb.text:
                    actions.append(f"restored {rb.kind} block in {rs.heading.text if rs.heading else '(intro)'!r}")
                    cb.text = rb.text
                prev = cb
            elif structural:
                new = _copy(rb)
                cs.blocks.insert(_idx(cs.blocks, prev) + 1 if prev is not None else 0, new)
                actions.append(f"re-inserted {rb.kind} block in {rs.heading.text if rs.heading else '(intro)'!r}")
                prev = new
    return _render(front, cand)


def _attach_link(cb: Block, rb: Block, token: str) -> bool:
    """Re-attach an inline link at the matching sentence of the candidate paragraph."""
    anchor = token[1:token.index("](")]
    ref_sent = next((s for s in split_sentences(rb.text) if token in s), None)
    if not ref_sent:
        return False
    sents = split_sentences(cb.text)
    if not sents:
        return False
    plain = strip_inline(ref_sent)
    best = max(sents, key=lambda s: _ratio(plain, s))
    if _ratio(plain, best) < SENT_MATCH or anchor not in best:
        return False
    span = re.search(r"\s+".join(map(re.escape, best.split())), cb.text)
    if not span:
        return False
    seg = span.group(0)
    new_seg = re.sub(r"(?<!\[)" + re.escape(anchor) + r"(?!\]\()", lambda m: token, seg, count=1)
    if new_seg == seg:
        return False
    cb.text = cb.text[: span.start()] + new_seg + cb.text[span.end():]
    return True


def _phase_links(ref_md: str, cand_md: str, record: EvalRecord, actions: list[str]) -> str:
    _, ref = _parse(ref_md)
    front, cand = _parse(cand_md)
    rr, cr = find_refs(ref_md), find_refs(cand_md)
    missing = lost(rr["links"], cr["links"]) + lost(rr["images"], cr["images"])
    match = _align(ref, cand)
    for tok in missing:
        loc = next(((i, j) for i, s in enumerate(ref) for j, b in enumerate(s.blocks) if b.kind != "code" and tok in b.text), None)
        if loc is None:
            continue
        i, j = loc
        rb = ref[i].blocks[j]
        if i not in match:
            actions.append(_restore_section(ref, cand, match, i))
            continue
        cs = match[i]
        if any(tok in b.text for b in cs.blocks):
            continue  # already restored by an earlier token in the same block
        cb = _assign([rb], cs.blocks).get(0)
        if cb is None:
            prev = None
            for k in range(j - 1, -1, -1):
                prev = _assign([ref[i].blocks[k]], cs.blocks).get(0)
                if prev is not None:
                    break
            cs.blocks.insert(_idx(cs.blocks, prev) + 1 if prev is not None else 0, _copy(rb))
            actions.append(f"re-inserted paragraph carrying {tok[:60]!r}")
        elif LINK_INLINE.fullmatch(tok) and _attach_link(cb, rb, tok):
            actions.append(f"re-attached link {tok[:60]!r} at the matching sentence")
        else:
            cb.text = rb.text
            actions.append(f"restored paragraph carrying {tok[:60]!r}")
    return _render(front, cand)


def write_healed(ctx: PackageCtx, cycle: int, text: str) -> Path:
    """article-healed-<n>.md, exclusive create: bumps n rather than ever overwriting an earlier version."""
    n = max(cycle, 1)
    while True:
        p = ctx.package / HEALED_PATTERN.format(n=n)
        try:
            with open(p, "x", encoding="utf-8") as fh:
                fh.write(text)
            return p
        except FileExistsError:
            n += 1


class DeterministicRepairer:
    name = "DeterministicRepairer"

    def __init__(self) -> None:
        self.last_description = ""

    def __call__(self, ctx: PackageCtx, candidate: Path, record: EvalRecord, cycle: int) -> Path | None:
        self.last_description = f"{self.name}: declined"
        ref_path = ctx.reference_path
        if ref_path is None or not Path(ref_path).is_file():
            self.last_description += " (no readable reference)"
            return None
        try:
            ref_md = Path(ref_path).read_text(encoding="utf-8")
            cand_md = Path(candidate).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            self.last_description += f" (unreadable: {type(e).__name__})"
            return None
        cats = set(failure_categories(record)) | {classify(record)}
        if Category.MISSING_SOURCE in cats:
            self.last_description += " (MISSING_SOURCE)"
            return None
        cats &= CONTENT_CATEGORIES
        if not cats:
            self.last_description += " (no content category)"
            return None
        actions: list[str] = []
        text = cand_md
        phases = [(Category.ADDED_UNSUPPORTED_CLAIM, _phase_added), (Category.CONTENT_CLAIM_FAILURE, _phase_content),
                  (Category.STRUCTURAL_DAMAGE, _phase_structure), (Category.MISSING_LINK, _phase_links)]
        try:
            for cat, fn in phases:
                if cat in cats:
                    text = fn(ref_md, text, record, actions)
        except _Decline as e:
            self.last_description += f" ({e})"
            return None
        if text == cand_md:
            self.last_description += " (nothing restorable from the reference)"
            return None
        out = write_healed(ctx, cycle, text)
        sha = hashlib.sha256(ref_md.encode()).hexdigest()[:12]
        self.last_description = f"{self.name}: " + "; ".join(actions) + f" [from {Path(ref_path).name} sha256 {sha}]"
        return out


class FaultyRepairer:
    """Fault injection for tests: makes the article worse (strips links, drops a section heading, adds an unsupported claim)."""
    name = "FaultyRepairer"

    def __init__(self) -> None:
        self.last_description = ""

    def __call__(self, ctx: PackageCtx, candidate: Path, record: EvalRecord, cycle: int) -> Path | None:
        text = Path(candidate).read_text(encoding="utf-8")
        text = re.sub(r"(?<!!)\[([^\]]+)\]\([^)]*\)", r"\1", text)
        text = re.sub(r"^## .*\n+", "", text, count=1, flags=re.M)
        text += f"\nFault injection {cycle}: revenue grew {cycle * 1000}% overnight.\n"
        self.last_description = f"{self.name}: injected damage (links stripped, heading dropped, unsupported claim added)"
        return write_healed(ctx, cycle, text)


# Module-level instance: release._load_heal() picks up `repair.repair` as the repairer.
repair = DeterministicRepairer()
