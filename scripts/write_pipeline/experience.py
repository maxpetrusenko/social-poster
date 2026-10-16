"""Experience trace gate: every first-person experience sentence must come from something the author actually supplied.

editguard.has_author_material answers "does any author source exist"; once one does, mdlib.EXPERIENCE lets every experience sentence through.
This gate is per sentence. A first-person experience sentence passes only when
  * it shares at least MIN_SHARED content words with one sentence of an answer span (the human stage's answers, or a captured author source), and
  * every number and every proper name in it also appears in the spans.
With no human answer and no author source, any such sentence fails. mdlib.EXPERIENCE is left as it is; the pattern here is wider.
"""
from __future__ import annotations

import re

from scripts.fingerprint_eval.textutil import split_sentences

from . import furniture as FU
from . import humaninput as HI
from . import mdlib as M

MIN_SHARED = 2
_VERBS = (r"(?:\w+ed|saw|ran|built|wrote|made|got|had|found|lost|spent|took|led|met|heard|read|knew|kept|left|began|did|went|came|felt|thought|taught|sold|paid|"
          r"hit|broke|shipped|drove|chose|told|ate|slept|sat|stood|became|grew|won|set|put|cut|dealt|gave|brought|bought|caught|saw)")
EXPERIENCE_WIDE = re.compile(
    r"(?:\bI(?:'ve|’ve| have|'d|’d| had)\b"            # I've seen / I have run / I'd built
    r"|\bI\s+(?:once|never|also|then|later|recently|first|finally|still|always|often|usually|just)?\s*(?!(?:need|feed|embed|proceed|succeed|exceed|speed|bleed|indeed)\b)" + _VERBS + r"\b"      # I tested / I once wrote
    r"|\bin my (?:experience|work|career|years|time|last|previous|current|team|company)\b"
    r"|\bwhen I\b|\bmy (?:team|company|clients?|customers?|colleagues?|manager|boss|last|previous|first|old|former)\b"
    r"|\b(?:we|my team and I)\s+(?:once|never|also|then|later|recently|first|finally|always|often|usually)?\s*(?!(?:need|feed|embed|proceed|succeed|exceed|speed|bleed|indeed)\b)" + _VERBS + r"\b)", re.I)

_STOP = frozenset("""a about above after again all also an and any are as at be because been before being between both but by can could did do does doing down during each few
for from further had has have having he her here hers him his how i if in into is it its just may me more most my no nor not now of off on once only or other our out over same
she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who whom why will
with would you your ive id seen saw run ran built used tried tested worked made got went came thing things way ways lot kind sort really actually always never often usually""".split())
_WORD = re.compile(r"[a-z][a-z0-9'’-]*", re.I)
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?%?")
_NAME = re.compile(r"\b[A-Z][A-Za-z0-9]*[A-Za-z0-9]\b")
_NOT_NAMES = frozenset({"I", "I'm", "I've", "I'd", "I'll", "In", "My", "We", "When", "The", "A", "An", "It", "This", "That", "At", "On", "After", "Before", "Then", "But", "And", "So", "Later"})


def _content(s: str) -> set[str]:
    return {w.lower().strip("'-’") for w in _WORD.findall(s) if len(w) >= 3 and w.lower() not in _STOP}


def _numbers(s: str) -> set[str]:
    return {m.rstrip(".,").replace(",", "") for m in _NUM.findall(s)}


def _names(s: str) -> set[str]:
    """Capitalised words that are not the first word of the sentence and not a plain pronoun or connective."""
    toks = list(_NAME.finditer(s))
    first = re.match(r"\W*(\w+)", s)
    skip = first.start(1) if first else -1
    return {m.group(0) for m in toks if m.start() != skip and m.group(0) not in _NOT_NAMES}


def experience_sentences(text: str) -> list[str]:
    """First-person experience sentences of the article prose: code, quotes, headings, the italic disclosure line and the frozen footer excluded."""
    body = FU.split_footer(M.strip_code(text))[0]
    out = []
    for b in M.blocks(body):
        if b.kind != "paragraph":
            continue
        t = b.text.strip()
        if t.startswith(("![", ">")) or re.fullmatch(r"\*[^*\n]+\*", t):
            continue
        out += [s for s in split_sentences(t) if EXPERIENCE_WIDE.search(s)]
    return out


def spans(human: dict | None, author_sources: list[str] | None) -> list[str]:
    """Sentences the author supplied: the human stage's answers (only when answered) and the text of captured author-kind sources."""
    raw = [HI.answered_text(human or {}), *(author_sources or [])]
    out: list[str] = []
    for r in raw:
        for para in re.split(r"\n+", r):
            out += split_sentences(para.strip()) or ([para.strip()] if para.strip() else [])
    return [s for s in out if s.strip()]


def untraced(text: str, human: dict | None, author_sources: list[str] | None) -> list[dict]:
    """[{sentence, reason}] for every first-person experience sentence that the author's answers do not back."""
    sent = experience_sentences(text)
    if not sent:
        return []
    sp = spans(human, author_sources)
    status = (human or {}).get("status")
    allsp = "\n".join(sp)
    out = []
    for s in sent:
        if not sp:
            why = "no human answer was given" if status != "answered" else "no author text to trace it to"
            out.append({"sentence": s, "reason": f"{why}: the run has no first-person experience to draw on, so this sentence is invented. Cut it or state the point without 'I'"})
            continue
        want = _content(s)
        best = max(sp, key=lambda x: len(want & _content(x)))
        if len(want & _content(best)) < MIN_SHARED:
            out.append({"sentence": s, "reason": f"no answer span shares {MIN_SHARED} content words with it: not traceable to what the author said"})
            continue
        low = allsp.lower()
        miss_n = sorted(n for n in _numbers(s) if n not in _numbers(allsp))
        miss_p = sorted(p for p in _names(s) if p.lower() not in low)
        if miss_n or miss_p:
            out.append({"sentence": s, "reason": f"number or name not in the author's answers: {(miss_n + miss_p)[:4]}"})
    return out


def reasons(text: str, trace: dict | None) -> list[str]:
    """Guard-style reasons. trace = {"human": <human stage json>, "author_sources": [text, ...]} (deps_ctx builds it); None = gate not wired."""
    if trace is None:
        return []
    return [f"experience trace: {u['sentence'][:100]!r}: {u['reason']}" for u in untraced(text, trace.get("human"), trace.get("author_sources"))[:3]]
