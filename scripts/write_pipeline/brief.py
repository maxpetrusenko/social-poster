"""Stage `brief`: a compact, deterministic generation-time brief (400 words at most) the draft, editorial and voice stages must cite.

Inputs: the author-corpus profile (authorprofile.py, built on scripts.fingerprint_eval.metrics), the evaluator's signal and template
definitions (metrics.TEMPLATES, TRANSITIONS), the evidence/claim map and the editorial requirements. Output: targets the writer can
follow while drafting, not a post-hoc score. The hierarchy it records decides every conflict:
factual > source/link > semantic > quality > voice > fingerprint.
"""
from __future__ import annotations

import json

from scripts.fingerprint_eval import metrics as FM

from . import antifp as AF
from . import authorprofile as PF
from . import fpcaps as FC
from .core import DONE, Pipeline, sha_bytes

HIERARCHY = ["factual", "source/link", "semantic", "quality", "voice", "fingerprint"]
MAX_WORDS = 400
PROMPT_BLOCK_WORDS = 300
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
        "same_two_word_opener_share_max": _r(b["structural_repetition"]["p90"], 2),
        "fingerprint_caps": FC.caps(),  # fingerprint caps never come from the author corpus; the author's distributions below are voice targets
        "author_transitions_per_1k_p90": _r(b["transition_density"]["p90"]),
        "punctuation_share": {k: _r(prof["punctuation_share"][k], 3) for k in (",", ";", ":", "(", "?")},
        "first_person_per_1k": _r(prof["first_person_per_1k"], 1),
        "claims": {"use": [str(c.get("id")) for c in claims if c.get("status") in ("supported", "attributed", "inference")],
                   "omit": [str(c.get("id")) for c in claims if c.get("status") == "unresolved"]},
        "sections": len(outline.get("sections") or []),
    }


def _one_sentence_share(t: dict) -> int:
    cap = AF.ONE_SENTENCE_PARA_FLOOR + t["fingerprint_caps"]["one_sentence_para_excess"]
    return int(min(t["one_sentence_paragraph_share"], cap) * 100)


def transitions_per_1k(t: dict) -> int:
    return int(AF.TRANSITION_FLOOR + t["fingerprint_caps"]["transition_excess"])


def caps_line(c: dict) -> str:
    return (f"template hits at most {int(c['template_hits'])} in the whole article (rule-of-three lists count as hits); no em dashes; "
            f"transitions at most {int(AF.TRANSITION_FLOOR + c['transition_excess'])} per 1k words; repeated 3 to 5-word sequences at most {c['repeated_ngram']} of sequences; "
            f"one-sentence paragraphs at most {int((AF.ONE_SENTENCE_PARA_FLOOR + c['one_sentence_para_excess']) * 100)} percent; composite at most {c['composite']} (final gate rejects at {AF.HEAVY_COMPOSITE})")


def _example(name: str) -> str:
    return {"this_isnt_x_its_y": "This isn't a cache tweak, it's a shift.", "not_x_but_y": "Not speed, but trust.", "not_only_but_also": "Not only fast but also cheap.",
            "here_is_the_thing": "Here's the catch: ...", "question_then_answer": "Why? Because ...", "what_x_really_means": "What this really means is ...",
            "ai_vocab": "robust, seamless, pivotal, landscape"}[name]


def prompt_block(t: dict) -> str:
    """Ready to paste, verbatim, into the draft, editorial and voice prompts. 300 words at most."""
    c, s, p = t["fingerprint_caps"], t["sentence_words"], t["paragraph_words"]
    names = [n for n, _ in FM.TEMPLATES]
    L = [
        "FINGERPRINT RULES (your text is measured by code and rejected with the offending sentences if it exceeds these):",
        "- " + caps_line(c).replace("; ", ".\n- ") + ".",
        "Banned patterns, each counts as a template hit: " + " | ".join(f'"{_example(n)}"' for n in names) + ".",
        "Rule of three: do not write 'X, Y and Z' lists in prose; use two items or four, or a sentence each.",
        f"Voice: sentences median {s['median']} words (spread {s['p10']} to {s['p90']}), paragraphs median {p['median']} words (spread {p['p10']} to {p['p90']}); mix short and long.",
        f"Punctuation: commas, few colons and semicolons, no em dashes, no tables. First person about {t['first_person_per_1k']} per 1k words, only for experience the author supplied.",
        "Never trade a fact, a link or a claim's meaning for any of this.",
    ]
    text = "\n".join(L)
    words = text.split()
    return text if len(words) <= PROMPT_BLOCK_WORDS else " ".join(words[:PROMPT_BLOCK_WORDS])


def render(t: dict) -> str:
    s, p = t["sentence_words"], t["paragraph_words"]
    pu = t["punctuation_share"]
    L = [
        "FINGERPRINT AND VOICE BRIEF",
        f"Priority when rules conflict: {' > '.join(HIERARCHY)}. Never trade a fact, a link or a claim's meaning for a fingerprint target.",
        f"Sentences: median {s['median']} words, middle spread {s['p10']} to {s['p90']}; mix short and long, coefficient of variation at least {t['sentence_length_cv_min']}. No run of three sentences within 25 percent of one length.",
        f"Paragraphs: median {p['median']} words, spread {p['p10']} to {p['p90']}; about {_one_sentence_share(t)} percent may be one sentence. Vary paragraph size; never a uniform block rhythm.",
        f"Lists: at most {t['max_list_items']} items. Avoid rule-of-three chains (X, Y and Z): each counts as a template hit.",
        "HARD CAPS, measured by the same code that gates the final text (a draft over them is rejected with the offending sentences): " + caps_line(t["fingerprint_caps"]) + ".",
        "Banned openers: " + "; ".join(BANNED_OPENERS) + ".",
        "Banned closers: " + "; ".join(BANNED_CLOSERS) + ". End on the last substantive point.",
        f"Banned vocabulary: {AI_VOCAB}.",
        f"Transitions and signposts ({', '.join(FM.TRANSITIONS[:8])} ...): at most {transitions_per_1k(t)} per 1k words. No 'first, second, third' scaffolding, no announcing what comes next.",
        f"Repetition: no phrase of 3 to 5 words used twice; at most {int(t['same_two_word_opener_share_max'] * 100)} percent of sentences share a two-word opener.",
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
    block = prompt_block(t)
    art = {"hierarchy": HIERARCHY, "targets": t, "text": text, "word_count": len(text.split()), "generation_prompt_block": block, "prompt_block_words": len(block.split()),
           "inputs": {"author_docs": prof["n_docs"], "author_words": prof["n_words"], "signals": sorted(PF.SIGNALS),
                      "evaluator_templates": [n for n, _ in FM.TEMPLATES]}}
    main = (json.dumps(art, indent=1, sort_keys=True) + "\n").encode()
    out = _finish(pipe, "brief", main, "json")
    return {**out, "brief": text, "generation_prompt_block": block, "brief_sha256": current_hash(pipe), "word_count": art["word_count"],
            "then": f"paste generation_prompt_block verbatim into the draft, editorial and voice prompts; submit those stages with --report JSON containing {{\"{BRIEF_KEY}\": \"<this hash>\"}}"}


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

