"""Stage `brief`: a compact, deterministic generation-time brief (400 words at most) the draft, editorial and voice stages must cite.

Inputs: the author-corpus profile (authorprofile.py, built on scripts.fingerprint_eval.metrics), the evaluator's signal and template
definitions (metrics.TEMPLATES, TRANSITIONS), the evidence/claim map and the editorial requirements. Output: targets the writer can
follow while drafting, not a post-hoc score. The hierarchy it records decides every conflict:
factual > source/link > semantic > quality > voice > fingerprint.
"""
from __future__ import annotations

import json

from scripts.fingerprint_eval import metrics as FM

from . import authorprofile as PF
from .core import DONE, Pipeline, sha_bytes

HIERARCHY = ["factual", "source/link", "semantic", "quality", "voice", "fingerprint"]
MAX_WORDS = 400
BRIEF_KEY = "brief_sha256"

BANNED_OPENERS = ["This isn't X, it's Y", "Not X but Y", "Not only X but also Y", "Here's the thing / the catch is", "Let's be honest", "What this really means",
                  "a question followed by its own answer"]
BANNED_CLOSERS = ["In conclusion", "In short", "In summary", "The bottom line", "What to do next", "a rhetorical question as the last line"]
AI_VOCAB = "delve, tapestry, landscape, realm, navigate, unlock, leverage, crucial, pivotal, testament, underscore, embark, seamless, robust, holistic"


def _r(x: float, n: int = 0):
    return round(x, n) if n else int(round(x))


def targets(prof: dict, ev: dict, outline: dict) -> dict:
    b, sl, pl = prof["bands"], prof["sentence_len"], prof["paragraph_len"]
    claims = [c for c in ev.get("claims", []) if isinstance(c, dict)]
    return {
        "sentence_words": {"p10": _r(sl["p10"]), "median": _r(sl["p50"]), "p90": _r(sl["p90"])},
        "paragraph_words": {"p10": _r(pl["p10"]), "median": _r(pl["p50"]), "p90": _r(pl["p90"])},
        "sentence_length_cv_min": _r(b["burstiness"]["p10"], 2),
        "one_sentence_paragraph_share": _r(prof["one_sentence_para_rate"], 2),
        "max_list_items": 3,
        "transitions_per_1k_max": _r(max(b["transition_density"]["p90"], 1.0)),
        "repeated_ngram_rate_max": _r(max(b["ngram_repetition"]["p90"], 0.001), 3),
        "same_two_word_opener_share_max": _r(b["structural_repetition"]["p90"], 2),
        "rule_of_three_per_1k_max": _r(b["rhetorical_repetition"]["p90"], 1),
        "punctuation_share": {k: _r(prof["punctuation_share"][k], 3) for k in (",", ";", ":", "(", "?")},
        "first_person_per_1k": _r(prof["first_person_per_1k"], 1),
        "claims": {"use": [str(c.get("id")) for c in claims if c.get("status") in ("supported", "attributed", "inference")],
                   "omit": [str(c.get("id")) for c in claims if c.get("status") == "unresolved"]},
        "sections": len(outline.get("sections") or []),
    }


def render(t: dict) -> str:
    s, p = t["sentence_words"], t["paragraph_words"]
    pu = t["punctuation_share"]
    L = [
        "FINGERPRINT AND VOICE BRIEF",
        f"Priority when rules conflict: {' > '.join(HIERARCHY)}. Never trade a fact, a link or a claim's meaning for a fingerprint target.",
        f"Sentences: median {s['median']} words, middle spread {s['p10']} to {s['p90']}; mix short and long, coefficient of variation at least {t['sentence_length_cv_min']}. No run of three sentences within 25 percent of one length.",
        f"Paragraphs: median {p['median']} words, spread {p['p10']} to {p['p90']}; about {int(t['one_sentence_paragraph_share'] * 100)} percent may be one sentence. Vary paragraph size; never a uniform block rhythm.",
        f"Lists: at most {t['max_list_items']} items. No rule-of-three chains in prose (limit {t['rule_of_three_per_1k_max']} per 1k words).",
        "Banned openers: " + "; ".join(BANNED_OPENERS) + ".",
        "Banned closers: " + "; ".join(BANNED_CLOSERS) + ". End on the last substantive point.",
        f"Banned vocabulary: {AI_VOCAB}.",
        f"Transitions and signposts ({', '.join(FM.TRANSITIONS[:8])} ...): at most {t['transitions_per_1k_max']} per 1k words. No 'first, second, third' scaffolding, no announcing what comes next.",
        f"Repetition: repeated 3 to 5-word sequences at most {t['repeated_ngram_rate_max']} of all sequences; at most {int(t['same_two_word_opener_share_max'] * 100)} percent of sentences share a two-word opener.",
        f"Punctuation habits (share of marks): commas {pu[',']}, colons {pu[':']}, parentheses {pu['(']}, semicolons {pu[';']}, questions {pu['?']}. No em dashes, no tables.",
        f"Author voice: first person about {t['first_person_per_1k']} per 1k words, but only for experience the author supplied. Never invent experience.",
        f"Claims: assert only ids {', '.join(t['claims']['use']) or 'none'}; omit {', '.join(t['claims']['omit']) or 'none'}; every figure and link from the evidence map.",
        f"Structure: follow the outline's {t['sections']} sections; keep headings, links and numbers intact through editorial and voice passes.",
    ]
    text = "\n".join(L)
    words = text.split()
    if len(words) > MAX_WORDS:  # defensive: the template is fixed, but long claim id lists could push it over
        text = " ".join(words[:MAX_WORDS])
    return text


def run_brief(pipe: Pipeline) -> dict:
    from .submit import _finish
    ok, why = pipe.can_run("brief")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "brief", "reasons": [why]}
    try:
        prof = PF.get_profile()
    except (OSError, ValueError) as e:
        msg = [f"author corpus unavailable: {str(e)[:200]}"]
        pipe.set("brief", "BLOCKED", reasons=msg, extra={"category": "DEPENDENCY_FAILURE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "brief", "reasons": msg}
    t = targets(prof, pipe.read_json("research"), pipe.read_json("outline"))
    text = render(t)
    art = {"hierarchy": HIERARCHY, "targets": t, "text": text, "word_count": len(text.split()),
           "inputs": {"author_docs": prof["n_docs"], "author_words": prof["n_words"], "signals": sorted(PF.SIGNALS),
                      "evaluator_templates": [n for n, _ in FM.TEMPLATES]}}
    main = (json.dumps(art, indent=1, sort_keys=True) + "\n").encode()
    out = _finish(pipe, "brief", main, "json")
    return {**out, "brief": text, "brief_sha256": current_hash(pipe), "word_count": art["word_count"],
            "then": f"submit draft/editorial/voice with --report JSON containing {{\"{BRIEF_KEY}\": \"<this hash>\"}}"}


def current_hash(pipe: Pipeline) -> str | None:
    """sha256 of the brief artifact bytes (what a reader of artifacts/*-brief.json can recompute); None unless the stage is DONE."""
    if pipe.status("brief") != DONE:
        return None
    raw = pipe.read_art("brief")
    return sha_bytes(raw.encode()) if raw is not None else None


def check_reference(pipe: Pipeline, stage: str, rep: dict | None) -> list[str]:
    """The submit metadata of draft, editorial and voice must name the current brief artifact hash."""
    want = current_hash(pipe)
    if want is None:
        return [f"the brief stage is not DONE: run 'run brief' first"]
    got = (rep or {}).get(BRIEF_KEY)
    if got != want:
        return [f"the {stage} stage must cite the generation brief: add \"{BRIEF_KEY}\": \"{want}\" to the --report JSON"
                + (f" (got {str(got)[:16]!r})" if got else " (key missing)")]
    return []

