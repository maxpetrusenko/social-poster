"""Author-corpus profile and the fingerprint signal definitions shared by the brief (generation time) and fpverify (final check).

Everything here is deterministic and built on `scripts.fingerprint_eval.metrics`. No model, no network. The author profile is
computed from the frozen author corpus (`data/fingerprint-eval/author-corpus`, .txt files already filtered to pre-2023), the same
files the evaluator's gate reads for its author anchor.
"""
from __future__ import annotations

import functools
import math
import re
import statistics
from collections import Counter
from pathlib import Path

from scripts.fingerprint_eval import metrics as FM
from scripts.fingerprint_eval.contracts import AUTHOR_CORPUS_DIR
from scripts.fingerprint_eval.textutil import body_text, core_markdown, split_sentences, words

from . import fpcontract as CT

REPO = Path(__file__).resolve().parents[2]
CORPUS_ENV = "WRITE_PIPELINE_AUTHOR_CORPUS"  # test and ops override; default is the frozen corpus shipped in the repo

SENT_BAND = 0.25   # a sentence is "typical" when within +-25% of the document median
OPENER_WORDS = 2


def corpus_dir(environ=None) -> Path:
    import os
    v = (environ if environ is not None else os.environ).get(CORPUS_ENV)
    return Path(v) if v else REPO / AUTHOR_CORPUS_DIR


def load_author_texts(directory: Path | None = None) -> list[str]:
    d = directory or corpus_dir()
    return [f.read_text(errors="ignore") for f in sorted(d.glob("*.txt"))]


def _lengths(md: str) -> tuple[list[int], list[int], list[str]]:
    """(sentence word counts, paragraph word counts, sentence texts), computed exactly as metrics.fingerprint does."""
    text = body_text(md)
    sents = [s for p in text.split("\n\n") for s in split_sentences(p)]
    sl = [len(words(s)) for s in sents if words(s)]
    pl = [len(words(p)) for p in text.split("\n\n") if words(p)]
    return sl, pl, sents


def _cv(xs: list[int]) -> float:
    if len(xs) < 2:
        return 0.0
    m = statistics.fmean(xs)
    return statistics.pstdev(xs) / m if m else 0.0


def _typical_share(xs: list[int]) -> float:
    """Share of items within +-SENT_BAND of the median: high = metronomic."""
    if len(xs) < 3:
        return 0.0
    med = statistics.median(xs)
    return sum(1 for x in xs if abs(x - med) <= SENT_BAND * med) / len(xs)


def _opener_repeat(sents: list[str]) -> float:
    """Share of sentences whose first two words open at least one other sentence (structural repetition)."""
    keys = [" ".join(re.findall(r"[a-z']+", s.lower())[:OPENER_WORDS]) for s in sents]
    keys = [k for k in keys if k]
    if len(keys) < 4:
        return 0.0
    c = Counter(keys)
    return sum(v for v in c.values() if v > 1) / len(keys)


def _rule_of_three(fp: dict) -> float:
    t = fp["templates"].get("rule_of_three_lists")
    return (t["count"] if t else 0) * 1000.0 / max(fp["n_words"], 1)


def _template_hits(fp: dict) -> float:
    return float(sum(t["count"] for k, t in fp["templates"].items() if k != "rule_of_three_lists"))


# name -> (bad direction, label, value function(fp, sentence_lens, paragraph_lens, sentences, centroid, fw_mean, fw_std))
# bad "high": larger is worse; "low": smaller is worse; "abs": the absolute threshold in ABSOLUTE applies.
SIGNALS: dict[str, dict] = {
    "sentence_regularity": {"bad": "high", "label": "sentence/syntax regularity (share of sentences within +-25% of the median length)"},
    "paragraph_regularity": {"bad": "high", "label": "paragraph regularity (share of paragraphs within +-25% of the median length)"},
    "structural_repetition": {"bad": "high", "label": "structural repetition (sentences sharing a two-word opener)"},
    "ngram_repetition": {"bad": "high", "label": "n-gram repetition (mean repeated 3-5 gram rate)"},
    "rhetorical_repetition": {"bad": "high", "label": "list/rhetorical repetition (rule-of-three constructions per 1k words)"},
    "list_density": {"bad": "high", "label": "list items per 1k words"},
    "burstiness": {"bad": "low", "label": "burstiness/variation (coefficient of variation of sentence length)"},
    "paragraph_variation": {"bad": "low", "label": "paragraph length variation (coefficient of variation)"},
    "transition_density": {"bad": "high", "label": "transition and signpost words per 1k words"},
    "author_distance": {"bad": "high", "label": "distance to the author corpus centroid (composite)"},
    "template_hits": {"bad": "abs", "label": "template hits (this-isnt-x-its-y, not-x-but-y, here-is-the-thing, AI vocabulary ...)"},
    "em_dash": {"bad": "abs", "label": "em dashes per 1k words (V6 forbids them in prose)"},
}
ABSOLUTE = {"template_hits": CT.caps()["template_hits"], "em_dash": CT.EM_DASH_REPORT_FLOOR}  # from the one contract (fpcontract)  # an absolute floor: at or above this the signal is significant


def measure(md: str, centroid: dict | None = None, fw: tuple[list[float], list[float]] | None = None) -> dict:
    """{"values": {signal: float}, "distance": {component: float}, "templates": {...}, "n_words": int} for one document."""
    core = core_markdown(md)
    fp = FM.fingerprint(core)
    sl, pl, sents = _lengths(core)
    v = {
        "sentence_regularity": _typical_share(sl),
        "paragraph_regularity": _typical_share(pl),
        "structural_repetition": _opener_repeat(sents),
        "ngram_repetition": float(fp["repeated_ngram_rate"]["mean"]),
        "rhetorical_repetition": _rule_of_three(fp),
        "list_density": float(fp["list_items_per_1k"]),
        "burstiness": _cv(sl),
        "paragraph_variation": _cv(pl),
        "transition_density": float(fp["transition_total_per_1k"]),
        "template_hits": _template_hits(fp),
        "em_dash": float(fp["em_dash_per_1k"]),
    }
    dist: dict = {}
    if centroid is not None:
        dist = FM.distance_to(centroid, fp, *(fw or (None, None)))
        v["author_distance"] = float(dist["composite"])
    return {"values": v, "distance": dist, "templates": {k: {"count": t["count"], "examples": t["examples"]} for k, t in fp["templates"].items()},
            "n_words": fp["n_words"], "mean_sent_len": fp["mean_sent_len"], "punct_dist": fp["punct_dist"]}


def _pct(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    if not xs:
        return 0.0
    k = (len(xs) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def author_profile(texts: list[str] | None = None) -> dict:
    """Percentile bands of every signal across the author's own documents, pooled length percentiles, habits and the centroid."""
    texts = texts if texts is not None else load_author_texts()
    if not texts:
        raise FileNotFoundError(f"author corpus is empty or missing: {corpus_dir()}")
    fps = [FM.fingerprint(t) for t in texts]
    cen = FM.centroid(fps)
    fw = FM.fw_stats(fps)
    per = [measure(t, cen, fw) for t in texts]
    bands = {k: {"p10": _pct([m["values"][k] for m in per], 0.10), "p50": _pct([m["values"][k] for m in per], 0.50),
                 "p90": _pct([m["values"][k] for m in per], 0.90)} for k in SIGNALS}
    sl, pl = [], []
    for t in texts:
        a, b, _ = _lengths(t)
        sl += a
        pl += b
    n_sent = max(sum(f["n_sentences"] for f in fps), 1)
    n_words = max(sum(f["n_words"] for f in fps), 1)
    punct_names = FM.PUNCT
    habits = {p: cen["punct_dist"][i] for i, p in enumerate(punct_names)}
    return {"n_docs": len(texts), "n_words": n_words, "bands": bands, "centroid": cen, "fw": fw,
            "sentence_len": {q: _pct([float(x) for x in sl], f) for q, f in (("p10", .1), ("p25", .25), ("p50", .5), ("p75", .75), ("p90", .9))},
            "paragraph_len": {q: _pct([float(x) for x in pl], f) for q, f in (("p10", .1), ("p25", .25), ("p50", .5), ("p75", .75), ("p90", .9))},
            "punctuation_share": habits,
            "questions_per_sentence": cen["question_rate"], "parentheticals_per_1k": cen["parenthetical_per_1k"], "first_person_per_1k": cen["first_person_per_1k"],
            "one_sentence_para_rate": cen["one_sentence_para_rate"], "transitions_per_1k": cen["transition_total_per_1k"],
            "ngram_repeat_mean": cen["repeated_ngram_rate"]["mean"], "semicolons_per_sentence": sum(t.count(";") for t in texts) / n_sent,
            "colons_per_sentence": sum(t.count(":") for t in texts) / n_sent}


def severity(name: str, value: float, band: dict) -> float:
    """0 when inside the author's band (or below the absolute floor); otherwise how far outside, in units of the p50 to p90 spread."""
    kind = SIGNALS[name]["bad"]
    if kind == "abs":
        floor = ABSOLUTE[name]
        return max(0.0, (value - floor) / floor + 1.0) if value >= floor else 0.0
    if kind == "high":
        spread = max(band["p90"] - band["p50"], 1e-6)
        return max(0.0, (value - band["p90"]) / spread)
    spread = max(band["p50"] - band["p10"], 1e-6)
    return max(0.0, (band["p10"] - value) / spread)


def evaluate(md: str, prof: dict) -> dict:
    """measure + per-signal severity, ranked. significant = outside the author's band (or over the absolute floor)."""
    m = measure(md, prof["centroid"], prof["fw"])
    rows = []
    for k in SIGNALS:
        val = m["values"].get(k)
        if val is None:
            continue
        sev = severity(k, val, prof["bands"][k])
        rows.append({"signal": k, "value": round(val, 4), "severity": round(sev, 3), "significant": sev > 0, "band": {q: round(x, 4) for q, x in prof["bands"][k].items()}})
    rows.sort(key=lambda r: -r["severity"])
    return {**m, "signals": rows, "strongest": [r for r in rows if r["significant"]][:5], "total_severity": round(sum(r["severity"] for r in rows), 3)}


@functools.lru_cache(maxsize=4)
def _cached(corpus: str, stamp: float) -> dict:
    return author_profile(load_author_texts(Path(corpus)))


def get_profile() -> dict:
    """The author profile of the configured corpus, computed once per process and per corpus mtime."""
    d = corpus_dir()
    stamp = max((f.stat().st_mtime for f in d.glob("*.txt")), default=0.0)
    return _cached(str(d), stamp)
