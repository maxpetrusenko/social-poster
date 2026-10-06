"""One source of truth for the generation-time fingerprint caps, and the check that enforces them on submitted text.

The numbers come from antifp (the stage that finally rejects heavy text): WEIGHTS, HEAVY_TEMPLATE_HITS and HEAVY_COMPOSITE are imported, never
copied. Caps are expressed in antifp's own metrics and units (template_hits total, transition_excess, repeated_ngram,
one_sentence_para_excess, em_dash_per_1k, composite) and sit below the pass thresholds with a margin, so text that meets the brief also
passes the final gate. Author-corpus targets are voice targets only and can tighten a cap, never loosen it.
"""
from __future__ import annotations

from collections import Counter

from scripts.fingerprint_eval import metrics as FM
from scripts.fingerprint_eval.textutil import core_markdown, parse_blocks, split_sentences, words

from . import antifp as AF

MAX_REJECTIONS = 2  # per stage; the next fingerprint failure is accepted with a recorded fingerprint_debt that antifp must clear
COMPOSITE_MARGIN = 0.7  # the composite cap is this share of the heavy threshold
TEMPLATE_MARGIN = 2  # template hits allowed = heavy threshold minus this
SHARES = {"transition_excess": 0.25, "repeated_ngram": 0.15, "one_sentence_para_excess": 0.12}  # share of the composite budget each soft signal may use
TOP = 3


def caps(author_bands: dict | None = None) -> dict:
    """The fingerprint caps in antifp units. `author_bands` (author p90 values, same units) may only lower a cap."""
    composite = round(AF.HEAVY_COMPOSITE * COMPOSITE_MARGIN, 2)
    c = {"template_hits": float(max(AF.HEAVY_TEMPLATE_HITS - TEMPLATE_MARGIN, 0)), "em_dash_per_1k": 0.0, "composite": composite}
    for k, share in SHARES.items():
        c[k] = round(composite * share / AF.WEIGHTS[k], 3)
    for k, v in (author_bands or {}).items():
        if k in c and k not in ("composite", "em_dash_per_1k") and v is not None:
            c[k] = round(min(c[k], v), 3)
    return c


def violations(sig: dict, cap: dict) -> list[dict]:
    out = []
    for k, limit in cap.items():
        val = sig["composite"] if k == "composite" else sig["values"][k]
        if val > limit + 1e-9:
            out.append({"signal": k, "value": round(val, 3), "cap": limit})
    return out


def _prose(text: str) -> tuple[list[str], list[str]]:
    paras = [b.text for b in parse_blocks(core_markdown(text)) if b.kind == "paragraph"]
    return paras, [s for p in paras for s in split_sentences(p)]


def template_sentences(text: str) -> list[dict]:
    """Every sentence the evaluator counts as a template hit (not only the first three examples)."""
    _, sents = _prose(text)
    windows = [sents[i] + " " + sents[i + 1] if i + 1 < len(sents) else sents[i] for i in range(len(sents))]
    out = []
    for name, rx in FM.TEMPLATES:
        for w in (windows if name in ("this_isnt_x_its_y", "question_then_answer") else sents):
            if rx.search(w):
                out.append({"template": name, "sentence": w[:200]})
    out += [{"template": "rule_of_three_lists", "sentence": s[:200]} for s in sents if FM.RULE_OF_THREE.search(s)]
    return out


def dense_paragraphs(text: str, top: int = TOP) -> list[dict]:
    paras, _ = _prose(text)
    rows = []
    for p in paras:
        toks = words(p)
        hits = [t for t in toks if t in FM.TRANSITIONS]
        if len(toks) >= 8 and hits:
            rows.append({"per_100_words": round(100 * len(hits) / len(toks), 1), "transitions": sorted(set(hits)), "paragraph": p[:240]})
    rows.sort(key=lambda r: -r["per_100_words"])
    return rows[:top]


def repeated_ngrams(text: str, top: int = 5) -> list[dict]:
    toks = words(core_markdown(text))
    seen: list[str] = []
    out = []
    for n in (5, 4, 3):
        c = Counter(" ".join(toks[i:i + n]) for i in range(len(toks) - n + 1))
        for g, k in c.most_common():
            if k < 2:
                break
            if {"https", "http", "www", "com", "org", "net", "pii"} & set(g.split()):  # link text, not prose: nothing to rewrite
                continue
            if any(g in s for s in seen):  # a shorter gram inside an already listed longer one adds nothing
                continue
            seen.append(g)
            out.append({"ngram": g, "count": k})
    out.sort(key=lambda r: (-len(r["ngram"].split()), -r["count"]))
    return out[:top]


def one_sentence_paragraphs(text: str, top: int = TOP) -> list[str]:
    paras, _ = _prose(text)
    return [p[:160] for p in paras if len(split_sentences(p)) == 1][:top]


def em_dashes(text: str) -> list[str]:
    return [s[:160] for s in _prose(text)[1] if "—" in s or " -- " in s][:TOP]


def offenders(text: str, viol: list[dict]) -> dict:
    """The exact passages behind each violated cap."""
    bad = {v["signal"] for v in viol}
    out: dict = {}
    if bad & {"template_hits", "composite"}:
        out["template_hits"] = template_sentences(text)
    if bad & {"transition_excess", "composite"}:
        out["transition_dense_paragraphs"] = dense_paragraphs(text)
    if bad & {"repeated_ngram", "composite"}:
        out["repeated_ngrams"] = repeated_ngrams(text)
    if "one_sentence_para_excess" in bad:
        out["one_sentence_paragraphs"] = one_sentence_paragraphs(text)
    if "em_dash_per_1k" in bad:
        out["em_dash_sentences"] = em_dashes(text)
    return out


def check(text: str, cap: dict | None = None) -> dict:
    cap = cap or caps()
    sig = AF.signals(text)
    viol = violations(sig, cap)
    return {"ok": not viol, "caps": cap, "values": sig["values"], "composite": sig["composite"], "violations": viol,
            "offenders": offenders(text, viol) if viol else {}}


def reasons(res: dict, stage: str, attempt: int) -> list[str]:
    """Plain rejection lines: what exceeded which cap, then the exact passages to rewrite."""
    r = [f"fingerprint caps exceeded in the {stage} text (rejection {attempt} of {MAX_REJECTIONS}; the next one is accepted as recorded fingerprint debt): "
         + "; ".join(f"{v['signal']} {v['value']} > cap {v['cap']}" for v in res["violations"]) + ". Regenerate with the brief's targets and rewrite these passages:"]
    o = res["offenders"]
    r += [f"template hit [{h['template']}]: {h['sentence']!r}" for h in o.get("template_hits", [])]
    r += [f"transition-dense paragraph ({d['per_100_words']} per 100 words, {', '.join(d['transitions'])}): {d['paragraph']!r}" for d in o.get("transition_dense_paragraphs", [])]
    r += [f"repeated sequence x{g['count']}: {g['ngram']!r}" for g in o.get("repeated_ngrams", [])]
    r += [f"one-sentence paragraph: {p!r}" for p in o.get("one_sentence_paragraphs", [])]
    r += [f"em dash: {s!r}" for s in o.get("em_dash_sentences", [])]
    return r
