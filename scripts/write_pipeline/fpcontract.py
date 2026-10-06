"""The ONE fingerprint threshold and signal contract. Generation-time caps (fpcaps), the antifp loop and its heavy verdict, the author
signals of fpverify (authorprofile) and the fpverify acceptance rule all import their numbers and the composite signal measure from here.
Nothing else defines a threshold, weight or floor for these signals.

Heavy (antifp): template hits >= HEAVY_TEMPLATE_HITS or composite >= HEAVY_COMPOSITE. Caps (generation): below heavy with a margin.
`assess` is the single question every stage asks of a text: is it heavy, and does it exceed any cap.
"""
from __future__ import annotations

from scripts.fingerprint_eval import metrics as FM
from scripts.fingerprint_eval.textutil import core_markdown

HEAVY_TEMPLATE_HITS = 4
HEAVY_COMPOSITE = 18.0
TRANSITION_FLOOR = 12.0  # transition_excess = transitions per 1k words minus this
ONE_SENTENCE_PARA_FLOOR = 0.45
WEIGHTS = {"template_hits": 3.0, "em_dash_per_1k": 1.0, "repeated_ngram": 50.0, "one_sentence_para_excess": 10.0, "transition_excess": 0.05}

COMPOSITE_MARGIN = 0.7  # the composite cap is this share of the heavy threshold
TEMPLATE_MARGIN = 2  # template hits allowed = heavy threshold minus this
SHARES = {"transition_excess": 0.25, "repeated_ngram": 0.15, "one_sentence_para_excess": 0.12}  # share of the composite budget each soft signal may use
EM_DASH_CAP = 0.0  # V6 forbids em dashes in prose
EM_DASH_REPORT_FLOOR = 0.01  # per 1k words: the reporting resolution of the em dash author signal (one dash in 100k words); the cap above is still 0


def signals(text: str) -> dict:
    fp = FM.fingerprint(core_markdown(text))
    tmpl = fp["templates"]
    v = {
        "template_hits": float(sum(t["count"] for t in tmpl.values())),
        "em_dash_per_1k": float(fp["em_dash_per_1k"]),
        "repeated_ngram": float(fp["repeated_ngram_rate"]["mean"]),
        "one_sentence_para_excess": max(0.0, fp["one_sentence_para_rate"] - ONE_SENTENCE_PARA_FLOOR),
        "transition_excess": max(0.0, fp["transition_total_per_1k"] - TRANSITION_FLOOR),
    }
    return {"values": v, "composite": round(sum(WEIGHTS[k] * x for k, x in v.items()), 4),
            "templates": {k: {"count": t["count"], "examples": t["examples"]} for k, t in tmpl.items()}, "n_words": fp["n_words"]}


def is_heavy(sig: dict) -> bool:
    return sig["values"]["template_hits"] >= HEAVY_TEMPLATE_HITS or sig["composite"] >= HEAVY_COMPOSITE


def caps(author_bands: dict | None = None) -> dict:
    """The generation caps in the contract's units. `author_bands` (author p90 values, same units) may only lower a cap."""
    composite = round(HEAVY_COMPOSITE * COMPOSITE_MARGIN, 2)
    c = {"template_hits": float(max(HEAVY_TEMPLATE_HITS - TEMPLATE_MARGIN, 0)), "em_dash_per_1k": EM_DASH_CAP, "composite": composite}
    for k, share in SHARES.items():
        c[k] = round(composite * share / WEIGHTS[k], 3)
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


def is_blocking(sig: dict, has_debt: bool, cap: dict | None = None) -> tuple[bool, list[dict]]:
    """(heavy, owed). Heavy is antifp's rule; a text that is over the generation caps while a stage accepted fingerprint_debt is heavy too: the debt
    must be cleared. This is the single acceptance rule antifp finish and fpverify both apply."""
    owed = violations(sig, cap or caps()) if has_debt else []
    return is_heavy(sig) or bool(owed), owed


def assess(text: str, has_debt: bool = False, cap: dict | None = None) -> dict:
    """{"heavy", "owed", "violations", "sig"}: the verdict every stage must agree with. violations lists every cap the text exceeds (informational
    unless a stage carries fingerprint_debt); heavy is the blocking verdict."""
    sig = signals(text)
    heavy, owed = is_blocking(sig, has_debt, cap)
    return {"heavy": heavy, "owed": owed, "violations": violations(sig, cap or caps()), "sig": sig}
