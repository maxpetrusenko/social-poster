"""Deterministic style fingerprint + distances. No model calls."""
from __future__ import annotations

import math
import re
from collections import Counter

from .textutil import body_text, parse_blocks, split_sentences, words, list_items

SENT_BINS = [4, 8, 12, 16, 20, 25, 30, 40, 10**6]
PARA_BINS = [10, 20, 40, 60, 90, 10**6]
PUNCT = [",", ";", ":", "—", "–", "-", "(", "?", "!", '"', "'", "…", "."]

FUNCTION_WORDS = (
    "the of and to a in that is was it for on with as be at by this but not or from are have had an "
    "they his her you we he she i which their there what all would if so no one more can do will "
    "when who about out up than them into its then could been has were just my your our also how "
    "me some these those only other because while over such even most any still between through "
    "before after both each here very much many too own same where why does did being should might "
    "must though until against during without within another every now like".split()
)
TRANSITIONS = (
    "however moreover furthermore therefore thus meanwhile instead still yet indeed notably "
    "ultimately crucially importantly additionally consequently nevertheless nonetheless "
    "overall finally first second third next then so but and because although"
).split()
FIRST_PERSON = {"i", "me", "my", "mine", "myself", "we", "our", "ours", "us", "ourselves", "i'm", "i've", "i'd", "i'll"}

# (name, regex). Applied to prose paragraphs, sentence-level.
TEMPLATES = [
    ("this_isnt_x_its_y", re.compile(r"\b(?:this|that|it|these|those|they|he|she|there)(?:\s+is|\s+are|'s|\s+was)?\s*(?:isn't|is not|aren't|are not|wasn't|was not|not)\b[^.?!]{0,120}[.;,—:-]\s*(?:it's|it is|it was|that's|that is|they're|they are|this is|he's|she's|but)\b", re.I)),
    ("not_x_but_y", re.compile(r"\bnot\s+(?:just\s+|only\s+|merely\s+|about\s+)?[^.?!,;]{2,80},\s*(?:but|it's|it is)\b", re.I)),
    ("not_only_but_also", re.compile(r"\bnot only\b[^.?!]{3,120}\bbut (?:also )?", re.I)),
    ("here_is_the_thing", re.compile(r"\b(?:here's the (?:thing|catch|part|kicker|problem)|the (?:catch|kicker|twist|truth)(?: is)?:|let's be honest|let me be clear)\b", re.I)),
    ("question_then_answer", re.compile(r"\?\s+(?:the (?:answer|reason|truth)|because|it|that|they|yes|no)\b[^.]{0,80}\.", re.I)),
    ("what_x_really_means", re.compile(r"\bwhat (?:this|that|it) (?:really |actually )?means\b", re.I)),
    ("ai_vocab", re.compile(r"\b(?:delve|tapestry|landscape|realm|navigate|unlock|leverage|crucial|pivotal|testament|underscore[sd]?|embark|seamless(?:ly)?|robust|holistic)\b", re.I)),
]
RULE_OF_THREE = re.compile(r"\b[\w'-]+(?: [\w'-]+)?, [\w'-]+(?: [\w'-]+)?,? (?:and|or) [\w'-]+(?: [\w'-]+)?\b")
CAVEAT_START = re.compile(r"^(?:but|however|that said|of course|to be fair|caveat|one caveat|the catch)\b", re.I)
CONCLUSION_HEAD = re.compile(r"conclusion|takeaway|bottom line|final|wrap|what to do|summary|in short", re.I)


def _norm(counter: Counter, keys) -> list[float]:
    tot = sum(counter.get(k, 0) for k in keys) or 1
    return [counter.get(k, 0) / tot for k in keys]


def _hist(values: list[int], bins: list[int]) -> list[float]:
    c = Counter()
    for v in values:
        for i, edge in enumerate(bins):
            if v <= edge:
                c[i] += 1
                break
    return _norm(c, range(len(bins)))


def _ngram_repeat_rate(toks: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for n in (3, 4, 5):
        grams = [tuple(toks[i : i + n]) for i in range(len(toks) - n + 1)]
        if not grams:
            out[str(n)] = 0.0
            continue
        c = Counter(grams)
        out[str(n)] = sum(v for v in c.values() if v > 1) / len(grams)
    out["mean"] = sum(out[str(n)] for n in (3, 4, 5)) / 3
    return out


def detect_templates(md: str) -> dict:
    """Template hits (count + examples) and macro-structure flags."""
    paras = [p for p in (b.text for b in parse_blocks(md) if b.kind == "paragraph")]
    found: dict[str, dict] = {}
    sents = [s for p in paras for s in split_sentences(p)]
    # join neighbouring sentences so "This isn't X. It's Y." spans are seen
    windows = [sents[i] + " " + sents[i + 1] if i + 1 < len(sents) else sents[i] for i in range(len(sents))]
    for name, rx in TEMPLATES:
        hits = []
        for w in (windows if name in ("this_isnt_x_its_y", "question_then_answer") else sents):
            m = rx.search(w)
            if m:
                hits.append(w[:160])
        if hits:
            found[name] = {"count": len(hits), "examples": hits[:3]}
    r3 = sum(1 for s in sents if RULE_OF_THREE.search(s))
    if r3:
        found["rule_of_three_lists"] = {"count": r3, "examples": [s[:160] for s in sents if RULE_OF_THREE.search(s)][:3]}
    # hook -> bullets(>=3) -> caveat -> conclusion
    blocks = parse_blocks(md)
    flow = False
    for i, b in enumerate(blocks):
        if b.kind == "list" and len(list_items(b.text)) >= 3:
            before = [x for x in blocks[:i] if x.kind == "paragraph"]
            after = blocks[i + 1 : i + 4]
            hook = bool(before) and len(before[-1].text.split()) <= 30
            cav = any(x.kind == "paragraph" and CAVEAT_START.match(x.text) for x in after)
            concl = any(x.kind == "heading" and CONCLUSION_HEAD.search(x.text) for x in blocks[i:])
            if hook and cav and concl:
                flow = True
    if flow:
        found["hook_bullets_caveat_conclusion"] = {"count": 1, "examples": []}
    return found


def fingerprint(md: str) -> dict:
    """Style fingerprint of one markdown/plain document (JSON-serialisable)."""
    blocks = parse_blocks(md)
    paras = [b for b in blocks if b.kind == "paragraph"]
    text = body_text(md)
    toks = words(text)
    n_words = max(len(toks), 1)
    sents = [s for p in text.split("\n\n") for s in split_sentences(p)]
    sent_lens = [len(words(s)) for s in sents if words(s)]
    para_lens = [len(words(p)) for p in text.split("\n\n") if words(p)]
    punct = Counter(ch for ch in text if ch in PUNCT)
    wc = Counter(toks)
    per_k = 1000.0 / n_words
    n_head = sum(1 for b in blocks if b.kind == "heading" and not b.text.startswith("# "))
    n_lists = sum(1 for b in blocks if b.kind == "list")
    n_items = sum(len(list_items(b.text)) for b in blocks if b.kind == "list")
    n_par_ct = max(len(para_lens), 1)
    return {
        "n_words": len(toks),
        "n_sentences": len(sent_lens),
        "n_paragraphs": len(para_lens),
        "sent_len_hist": _hist(sent_lens, SENT_BINS),
        "para_len_hist": _hist(para_lens, PARA_BINS),
        "mean_sent_len": sum(sent_lens) / max(len(sent_lens), 1),
        "punct_dist": _norm(punct, PUNCT),
        "function_words": [wc.get(w, 0) / n_words for w in FUNCTION_WORDS],
        "em_dash_per_1k": (text.count("—") + text.count(" -- ")) * per_k,
        "question_rate": text.count("?") / max(len(sent_lens), 1),
        "parenthetical_per_1k": len(re.findall(r"\([^)]{2,}\)", text)) * per_k,
        "first_person_per_1k": sum(wc[w] for w in FIRST_PERSON) * per_k,
        "heading_per_1k": n_head * per_k,
        "list_blocks_per_1k": n_lists * per_k,
        "list_items_per_1k": n_items * per_k,
        "one_sentence_para_rate": sum(1 for p in text.split("\n\n") if len(split_sentences(p)) == 1) / n_par_ct,
        "transition_per_1k": {t: wc.get(t, 0) * per_k for t in TRANSITIONS if wc.get(t)},
        "transition_total_per_1k": sum(wc.get(t, 0) for t in TRANSITIONS) * per_k,
        "repeated_ngram_rate": _ngram_repeat_rate(toks),
        "templates": detect_templates(md),
    }


# ---- distances -----------------------------------------------------------

def _pair(a: list[float], b: list[float]) -> None:
    """Equal length, non-empty, finite: zip() must never silently truncate."""
    if len(a) != len(b) or not a:
        raise ValueError(f"vector length mismatch or empty ({len(a)} vs {len(b)})")
    if not all(math.isfinite(x) for x in a) or not all(math.isfinite(x) for x in b):
        raise ValueError("non-finite value in vector")


def _kl(p: list[float], q: list[float]) -> float:
    return sum(a * math.log2(a / b) for a, b in zip(p, q) if a > 0 and b > 0)


def jsd(p: list[float], q: list[float]) -> float:
    """Jensen-Shannon distance (sqrt of divergence, base 2): 0 identical .. 1."""
    _pair(p, q)
    m = [(a + b) / 2 for a, b in zip(p, q)]
    return math.sqrt(max(0.0, (_kl(p, m) + _kl(q, m)) / 2))


def cosine_distance(a: list[float], b: list[float]) -> float:
    """Cosine distance. Two zero vectors are identical (0.0); one zero vector is maximally distant (1.0)."""
    _pair(a, b)
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if not na and not nb:
        return 0.0
    if not na or not nb:
        return 1.0
    d = 1.0 - sum(x * y for x, y in zip(a, b)) / (na * nb)
    if not math.isfinite(d):
        raise ValueError("non-finite cosine distance")
    return d


def burrows_delta(a: list[float], b: list[float], mean: list[float], std: list[float]) -> float:
    """Mean absolute z-score difference over function words."""
    _pair(a, b)
    _pair(mean, std)
    if len(a) != len(mean):
        raise ValueError(f"vector length mismatch ({len(a)} vs {len(mean)})")
    za = [(x - m) / s for x, m, s in zip(a, mean, std) if s > 0]
    zb = [(x - m) / s for x, m, s in zip(b, mean, std) if s > 0]
    return sum(abs(x - y) for x, y in zip(za, zb)) / max(len(za), 1)


def fw_stats(fps: list[dict]) -> tuple[list[float], list[float]]:
    n = len(FUNCTION_WORDS)
    vecs = [f["function_words"] for f in fps]
    mean = [sum(v[i] for v in vecs) / len(vecs) for i in range(n)]
    std = [math.sqrt(sum((v[i] - mean[i]) ** 2 for v in vecs) / max(len(vecs) - 1, 1)) for i in range(n)]
    return mean, std


def centroid(fps: list[dict]) -> dict:
    """Mean of per-document distributions (each document weighs equally)."""
    keys = ["sent_len_hist", "para_len_hist", "punct_dist", "function_words"]
    out = {k: [sum(f[k][i] for f in fps) / len(fps) for i in range(len(fps[0][k]))] for k in keys}
    scal = ["em_dash_per_1k", "question_rate", "parenthetical_per_1k", "first_person_per_1k", "heading_per_1k",
            "list_items_per_1k", "one_sentence_para_rate", "mean_sent_len", "transition_total_per_1k"]
    for k in scal:
        out[k] = sum(f[k] for f in fps) / len(fps)
    out["repeated_ngram_rate"] = {"mean": sum(f["repeated_ngram_rate"]["mean"] for f in fps) / len(fps)}
    out["n_docs"] = len(fps)
    return out


def distance_to(ref: dict, fp: dict, fw_mean: list[float] | None = None, fw_std: list[float] | None = None) -> dict:
    """Component distances from a fingerprint to a reference (centroid or fingerprint)."""
    d = {
        "sentence_length_jsd": jsd(ref["sent_len_hist"], fp["sent_len_hist"]),
        "paragraph_length_jsd": jsd(ref["para_len_hist"], fp["para_len_hist"]),
        "punctuation_jsd": jsd(ref["punct_dist"], fp["punct_dist"]),
        "function_word_cosine": cosine_distance(ref["function_words"], fp["function_words"]),
    }
    if fw_mean is not None and fw_std is not None:
        d["burrows_delta"] = burrows_delta(ref["function_words"], fp["function_words"], fw_mean, fw_std)
    d["composite"] = (d["sentence_length_jsd"] + d["paragraph_length_jsd"] + d["punctuation_jsd"] + d["function_word_cosine"]) / 4
    return d


def shift(reference: dict, original: dict, rewrite: dict, fw_mean=None, fw_std=None) -> dict:
    """Before/after distance to `reference`, plus original->rewrite drift."""
    before = distance_to(reference, original, fw_mean, fw_std)
    after = distance_to(reference, rewrite, fw_mean, fw_std)
    return {
        "before": before,
        "after": after,
        "delta": {k: after[k] - before[k] for k in before},  # negative = moved toward reference
        "original_vs_rewrite": distance_to(original, rewrite, fw_mean, fw_std),
    }


def outlier_score(corpus_fps: list[dict], fp: dict, fw_mean=None, fw_std=None) -> dict:
    """Where `fp` sits against the pipeline corpus: composite distance to the corpus
    centroid, as a z-score and percentile among the corpus documents' own distances."""
    c = centroid(corpus_fps)
    dists = [distance_to(c, f, fw_mean, fw_std)["composite"] for f in corpus_fps]
    mu = sum(dists) / len(dists)
    sd = math.sqrt(sum((x - mu) ** 2 for x in dists) / max(len(dists) - 1, 1)) or 1e-9
    own = distance_to(c, fp, fw_mean, fw_std)["composite"]
    return {
        "distance_to_corpus_centroid": own,
        "corpus_mean_distance": mu,
        "z": (own - mu) / sd,
        "percentile": sum(1 for x in dists if x <= own) / len(dists),
        "n_corpus_docs": len(dists),
    }
