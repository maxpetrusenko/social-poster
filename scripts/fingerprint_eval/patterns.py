"""Advisory detectors for the writing patterns GPTZero and Winston flagged in Max's articles.

Deterministic, no model. ADVISORY: these names are not in metrics.TEMPLATES or fpcontract.WEIGHTS, so they never enter the composite, a cap,
a gate or an optimization target. They exist to measure and to learn patterns (the brief lists them as things to avoid; the before/after
panel shows their counts). Quotes, blockquotes, code, lists and link text are ignored: only the author's own paragraph prose is read.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from .textutil import LINK_RE, core_markdown, parse_blocks, split_sentences, strip_inline, words

REPO = Path(__file__).resolve().parents[2]
DEFAULT_CORPUS = REPO / "data" / "fingerprint-eval" / "detector-corpus.jsonl"
PATTERNS = ("so_closer", "tempting_frame", "setup_correct", "stacked_hedges", "vague_experience", "generic_scene", "dramatic_closer",
            "logic_framing", "clause_triple", "hedged_figures", "rhythm_uniformity")
MAX_EXAMPLES = 3
LINK, QUOTE, CODE = "⟦link⟧", "⟦quote⟧", "⟦code⟧"  # placeholders: ignored text stays out of every rule
CAPTION_RE = re.compile(r"^\*[^*\n]+\*$")

# ---- prose extraction --------------------------------------------------------------------------------------------------------------------------


def _clean(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"`[^`\n]+`", CODE, text)
    text = LINK_RE.sub(LINK, text)
    text = re.sub(r'"[^"\n]{2,}?"', QUOTE, text)
    return strip_inline(text).replace("\n", " ").strip()


def paragraphs(md: str) -> list[list[str]]:
    """Sentences of each author paragraph. Blockquotes, code, lists, headings, images, captions and link/quote/code spans are dropped."""
    out = []
    for b in parse_blocks(core_markdown(md)):
        if b.kind != "paragraph" or CAPTION_RE.match(b.text.strip()):
            continue
        sents = split_sentences(_clean(b.text))
        if sents:
            out.append(sents)
    return out


# ---- sentence rules ----------------------------------------------------------------------------------------------------------------------------

HEDGE_RE = re.compile(
    r"\b(?:cannot simply|can't simply|not simply|no clean|no clear|no simple|no single|not necessarily|not entirely|not fully|simply|arguably|perhaps|possibly|probably|"
    r"somewhat|presumably|ostensibly|supposedly|seemingly|essentially|more or less|to some extent|in some sense|in part|"
    r"largely|mostly|tends? to|seems? to|appears? to|may well|might well|could well)\b", re.I)
SO_RE = re.compile(r"^So,? (?:the|that|it|this|what|here|then|why|how)\b", re.I)
SO_TAIL_RE = re.compile(r"\b(?:whole|entire|bottom line|upshot|question|bet|math|real (?:question|issue|problem|test))\b|\b(?:hinges?|comes? down|boils down|turns?) (?:on|to)\b", re.I)
TEMPT_RE = re.compile(r"\b(?:it'?s|it is|is|be|feels?|seems?) (?:so |very |a little )?(?:tempting|easy|natural|comforting|neat) to (?:tell|say|think|read|frame|see|call|assume|conclude|blame)\b|"
                      r"\bthe tempting (?:story|read|version|conclusion|take|narrative|explanation)\b", re.I)
SETUP_RE = re.compile(r"\b(?:tempting|neat|tidy|clean|simple|easy|comfortable|convenient|familiar|obvious|popular|common|conventional) (?:\w+ )?(?:story|tale|version|narrative|read|reading|explanation|answer|lesson|take|conclusion|framing)\b|"
                      r"\b(?:the )?(?:story|conventional wisdom|common (?:view|assumption|belief)) (?:goes|is|says)\b|"
                      r"\b(?:many|most|some|everyone|people) (?:\w+ )?(?:assume|assumes|believe|believes|think|thinks|say|says|suppose|supposes)\b|"
                      r"\bit'?s tempting\b|\byou(?:'d| would| might) (?:think|assume|expect)\b", re.I)
CORRECT_RE = re.compile(r"^(?:but |yet |and )?(?:the (?:evidence|data|record|numbers|facts|reality|truth|research|results|picture|actual \w+)|that|this|it|the story|the reality)\b"
                        r".*\b(?:doesn't|does not|didn't|did not|isn't|is not|wasn't|was not|don't|do not|aren't|are not|can't|cannot|never|no evidence|fails?|falls? apart|is messier|is more complicated)\b|"
                        r"^(?:actually|in fact|in reality|the truth is|the reality is|but in reality|but actually)\b", re.I)
EXPERIENCE_RE = re.compile(r"\b(?:i|we)(?:'ve| have|'d| had)? (?:seen|watched|noticed|observed|run into|ran into|come across|dealt with|lived through|been through)\b"
                           r"(?: \w+){0,3} (?:versions? of|variants? of|flavou?rs? of|forms? of|this before|that before|it before|something similar|something like (?:this|that)|the same (?:thing|pattern|problem|story|movie)|a similar|similar \w+|this (?:problem|pattern|story|movie))", re.I)
DRAMATIC_RES = [re.compile(p, re.I) for p in (
    r"\b(?:finding out|learning|discovering|learn(?:ed|ing)? it) (?:now|the hard way|soon enough|too late)\b",
    r"\bthe (?:metric|math|numbers?|bill|clock|tide|wind|bet|market|tables?|ground) (?:has |have |had )?(?:finally|just|now|suddenly) (?:flipped|turned|shifted|come due|arrived|caught up|moved|changed|gave way)\b",
    r"\bfinally (?:flipped|turned|caught up|came due|arrived)\b",
    r"\b(?:in|the) (?:the )?(?:costliest|hardest|most expensive|most painful) way\b",
    r"\bthe same lesson\b")]
LOGIC_RES = [re.compile(p, re.I) for p in (
    r"\bthe (?:logic|thesis|premise|wager|calculus|reasoning) (?:of|behind) (?:the|this|that|it)\b",
    r"\b(?:logic|thesis|premise|wager|bet) (?:is|goes|runs) (?:that|like this|as follows)\b",
    r"\bhing(?:e|es|ed|ing) (?:entirely |largely |mostly |all )?on\b",
    r"\b(?:whole|entire) (?:thing|case|bet|argument|story|debate|question|game) (?:rests?|turns?|depends?|comes?|boils?)\b",
    r"\bboils? down to\b", r"\bcomes? down to (?:whether|one|a single|a simple|this)\b")]
FIG_RE = re.compile(r"\$?\d[\d,.]*\s?(?:billion|million|trillion|bn)\b", re.I)  # large-scale figures only
APPROX_RE = re.compile(r"\b(?:around|roughly|approximately|nearly|almost|about|close to)\s+\$?\d[\d,.]*\s?(?:billion|million|trillion|bn)\b", re.I)
PRON_LEAD = {"it", "this", "that", "which", "who", "they", "he", "she", "we", "i", "you", "the", "a", "an", "and", "but", "then", "also", "now", "so"}
PREPS = {"at", "without", "with", "in", "on", "for", "by", "from", "of", "to", "across", "under", "over", "through", "within", "into"}
IRREGULAR_PAST = set("tore went grew ran took made found saw built bought sold lost won paid left kept held brought thought wrote drew fell rose chose gave began came became "
                     "put set cut hit let told said knew threw shut broke spoke stole sent spent met led read fed fought taught caught dug swept stood understood".split())
NOT_VERBS_S = {"this", "his", "its", "has", "was", "is", "us", "as", "does", "yes", "perhaps", "always", "sometimes", "across", "plus", "less", "unless", "business", "process", "bias", "focus", "gas", "class", "pass"}
GENERIC_SUBJ_RE = re.compile(r"^(?:and |but )?(?:a|an|the|some|one|every|each|another) (?:[a-z][a-z-]+)(?: [a-z][a-z-]+)? (?!of\b)[a-z']+", re.I)


def _tokens(seg: str) -> list[str]:
    return re.findall(r"[A-Za-z$%][\w'$%-]*", seg.lower())


def _shapes(seg: str, first: bool = False) -> set[str]:
    """Grammatical shape(s) a list segment can have: past-tense clause, third-person verb, -ing phrase, adverb or preposition phrase."""
    t = _tokens(seg)
    if not t:
        return set()
    out: set[str] = set()
    i = 0
    while i < len(t) - 1 and t[i] in PRON_LEAD:
        i += 1
    for tok in t[:i + 3]:
        if tok in IRREGULAR_PAST or (tok.endswith("ed") and len(tok) > 4):
            out.add("past")
    lead = t[i]
    if (lead.endswith("ly") and len(lead) > 4) or lead in PREPS:
        out.add("adv")
    elif lead.endswith("ing") and len(lead) > 4:
        out.add("ving")
    elif lead.endswith("s") and not lead.endswith("ss") and len(lead) > 3 and lead not in NOT_VERBS_S and (i or not seg[:1].isupper()):
        out.add("vs")
    if first and t[-1].endswith("ly") and len(t[-1]) > 4:
        out.add("adv")
    return out


def _triple(sent: str) -> bool:
    """Three parallel clauses or phrases closed by ', and ...' (a plain short list is metrics.RULE_OF_THREE's, not this)."""
    if len(sent.split()) < 10:
        return False
    parts = [p.strip() for p in re.split(r",\s+", sent)]
    for i in range(2, len(parts)):
        if not re.match(r"^(?:and|or) ", parts[i], re.I):
            continue
        a, b, c = parts[i - 2], parts[i - 1], re.sub(r"^(?:and|or) ", "", parts[i], flags=re.I)
        if max(len(a.split()), len(b.split()), len(c.split())) <= 2 or min(len(b.split()), len(c.split())) < 2:
            continue
        if i >= 3 and _shapes(parts[i - 3], True) & _shapes(a) & _shapes(b):
            continue  # a longer run is a list, not a triple
        if _shapes(a, True) & _shapes(b) & _shapes(c):
            return True
    return False


def _concrete(sent: str) -> bool:
    """A number, a link, a quote or a proper noun anywhere but the first word."""
    if re.search(r"\d", sent) or LINK in sent or QUOTE in sent:
        return True
    toks = re.findall(r"[A-Za-z][\w'-]*", sent)
    return any(t[0].isupper() and t not in ("I", "I'm", "I've", "I'd", "I'll") for t in toks[1:])


def _generic_scene(sent: str) -> bool:
    """An invented, unnamed scene: three or more clauses, each a generic 'a team / the cost' subject, with nothing concrete in it."""
    if _concrete(sent) or len(sent.split()) < 14:
        return False
    parts = [p.strip() for p in re.split(r",\s+", sent)]
    if len(parts) < 3:
        return False
    return sum(1 for p in parts if GENERIC_SUBJ_RE.match(p)) >= 3 and bool(re.match(r"^(?:a|an|some|one|every|each)\b", parts[0], re.I))


def _sent_rules(sent: str) -> set[str]:
    hit: set[str] = set()
    if SO_RE.match(sent) and SO_TAIL_RE.search(sent):
        hit.add("so_closer")
    if TEMPT_RE.search(sent):
        hit.add("tempting_frame")
    if len({m.group(0).lower() for m in HEDGE_RE.finditer(sent)}) >= 2:
        hit.add("stacked_hedges")
    if EXPERIENCE_RE.search(sent) and not _concrete(sent):
        hit.add("vague_experience")
    if _generic_scene(sent):
        hit.add("generic_scene")
    if any(r.search(sent) for r in DRAMATIC_RES) and len(sent.split()) <= 30:
        hit.add("dramatic_closer")
    if any(r.search(sent) for r in LOGIC_RES):
        hit.add("logic_framing")
    if _triple(sent):
        hit.add("clause_triple")
    if len(FIG_RE.findall(sent)) >= 2 and APPROX_RE.search(sent):
        hit.add("hedged_figures")
    return hit


# ---- paragraph rhythm --------------------------------------------------------------------------------------------------------------------------

MIN_RHYTHM_PARAS = 6  # multi-sentence paragraphs needed before uniformity means anything
RHYTHM_SHARE = 0.6  # tuned on the author corpus: Max's own writing tops out at one file in 65 above this


def _shape(sents: list[str]) -> tuple[int, str]:
    """(sentence count capped at 4, closing sentence short/mid/long against the average earlier sentence): setup, evidence, punchline is (3, short)."""
    n = [len(s.split()) for s in sents]
    body = sum(n[:-1]) / (len(n) - 1)
    return (min(len(n), 4), "short" if n[-1] <= 0.6 * body else "long" if n[-1] >= 1.4 * body else "mid")


def _rhythm(paras: list[list[str]]) -> dict:
    """Share of multi-sentence paragraphs that have the same shape. count is the size of the dominant group once it passes RHYTHM_SHARE."""
    shapes = [_shape(p) for p in paras if len(p) >= 2]
    if len(shapes) < MIN_RHYTHM_PARAS:
        return {"count": 0, "examples": [], "share": 0.0}
    (shape, k), = Counter(shapes).most_common(1)
    share = round(k / len(shapes), 3)
    if share < RHYTHM_SHARE:
        return {"count": 0, "examples": [], "share": share}
    return {"count": k, "share": share, "examples": [f"{k} of {len(shapes)} multi-sentence paragraphs share one shape: {shape[0]} sentences, closing sentence {shape[1]} against the rest"]}


# ---- public ------------------------------------------------------------------------------------------------------------------------------------


def detect(md: str) -> dict:
    """{pattern: {count, examples}} over the author's paragraph prose. examples are the matching sentences (setup_correct: the two-sentence window)."""
    paras = paragraphs(md)
    out = {k: {"count": 0, "examples": []} for k in PATTERNS}

    def add(name: str, text: str) -> None:
        out[name]["count"] += 1
        if len(out[name]["examples"]) < MAX_EXAMPLES:
            out[name]["examples"].append(text[:240])

    for sents in paras:
        for i, s in enumerate(sents):
            for name in sorted(_sent_rules(s)):
                add(name, s)
            if i + 1 < len(sents) and SETUP_RE.search(s) and CORRECT_RE.search(sents[i + 1]):
                add("setup_correct", s + " " + sents[i + 1])
    out["rhythm_uniformity"] = _rhythm(paras)
    return out


def counts(md: str) -> dict:
    return {k: v["count"] for k, v in detect(md).items()}


def n_words(md: str) -> int:
    return len(words(" ".join(s for p in paragraphs(md) for s in p)))


def _syllables(w: str) -> int:
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w:
        return 0
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(n, 1)


def _wc(s: str) -> int:
    return len(re.findall(r"[A-Za-z][A-Za-z'-]*", s))


def readability(md: str) -> dict:
    """Flesch reading ease, Flesch-Kincaid grade, median sentence length and the share of sentences over 25 words, over paragraph prose."""
    sents = [s for p in paragraphs(md) for s in p]
    toks = [w for s in sents for w in re.findall(r"[A-Za-z][A-Za-z'-]*", s)]
    if not sents or not toks:
        return {"flesch": 0.0, "grade": 0.0, "long_sentence_share": 0.0, "n_sentences": 0, "median_sentence_words": 0}
    wps, spw = len(toks) / len(sents), sum(_syllables(w) for w in toks) / len(toks)
    lens = sorted(_wc(s) for s in sents)
    mid = len(lens) // 2
    return {"flesch": round(206.835 - 1.015 * wps - 84.6 * spw, 2), "grade": round(0.39 * wps + 11.8 * spw - 15.59, 2),
            "long_sentence_share": round(sum(1 for n in lens if n > 25) / len(lens), 4), "n_sentences": len(lens),
            "median_sentence_words": lens[mid] if len(lens) % 2 else (lens[mid - 1] + lens[mid]) / 2}


# ---- detector corpus echo ----------------------------------------------------------------------------------------------------------------------


def flagged_rows(corpus: Path | None = None) -> list[dict]:
    try:
        lines = Path(corpus or DEFAULT_CORPUS).read_text().splitlines()
    except OSError:
        return []
    rows = []
    for ln in lines:
        try:
            r = json.loads(ln)
        except ValueError:
            continue
        if isinstance(r, dict) and r.get("label") == "flagged" and r.get("sentence"):
            rows.append(r)
    return rows


def corpus_echo(md: str, corpus: Path | None = None, n: int = 5) -> dict:
    """Count of n-word (default 5) windows of the text that also occur in a sentence a detector flagged (detector-corpus.jsonl)."""
    flagged: set[tuple] = set()
    for r in flagged_rows(corpus):
        w = words(r["sentence"])
        flagged.update(tuple(w[i:i + n]) for i in range(len(w) - n + 1))
    if not flagged:
        return {"count": 0, "examples": []}
    hits: list[str] = []
    for sents in paragraphs(md):
        for s in sents:
            w = words(s)
            hits += [" ".join(w[i:i + n]) for i in range(len(w) - n + 1) if tuple(w[i:i + n]) in flagged]
    return {"count": len(hits), "examples": hits[:MAX_EXAMPLES]}
