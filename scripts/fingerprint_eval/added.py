"""ADDED_UNSUPPORTED_CLAIM: claims that exist only in the final are judged against the reference section and source notes.

Cheap by construction: sentences of the final prose that fuzzy-match (token Jaccard >= 0.8) a reference sentence are
skipped. If nothing new remains there are zero model calls. Otherwise claims are extracted ONLY from the new sentences
and judged "supported" / "unsupported" with strict JSON parsing (same rules as judge.py).
"""
from __future__ import annotations

import json
import re

from .contracts import Category
from .errors import EvaluationError
from .gateway import GatewayError, extract_json, resolve_model
from .judge import _FENCE
from .rewrite import EXTRACT_PROMPT, Segment, is_meta_claim, segment_article
from .textutil import Block, split_sentences, strip_inline, words

JACCARD = 0.8
MIN_WORDS = 4
MAX_NOTES_CHARS = 60000
SUPPORT_VERDICTS = ("supported", "unsupported")

SUPPORT_PROMPT = """/no_think
You check whether each numbered claim is supported by the reference material below. For each claim give a verdict:
- "supported": the material states it or clearly implies it, with the same names, numbers, and causal direction
- "unsupported": the material does not state or imply it, or contradicts it
Return ONLY JSON: [{{"i": 1, "verdict": "supported", "reason": "<=15 words"}}, ...]
Include exactly one entry per claim id, no others.

Claims:
{claims}

Reference material:
{material}
"""


def _fail(msg: str, cat: Category) -> EvaluationError:
    e = EvaluationError(msg)
    e.category = cat  # type: ignore[attr-defined]  (errors.EvaluationError gains this natively in W2)
    return e


def _jacc(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a | b else 1.0


def _ref_sentences(md: str) -> list[set]:
    out = []
    for seg in segment_article(md):
        for b in seg.blocks:
            if b.kind == "heading":
                continue
            for ln in (b.text.split("\n") if b.kind == "list" else [b.text]):
                for s in split_sentences(strip_inline(ln)):
                    out.append(set(words(s)))
    return out


def new_sentences(draft_md: str, final_md: str) -> dict[str, list[str]]:
    """{section: [sentence, ...]} for final prose sentences with no fuzzy counterpart anywhere in the reference."""
    ref = _ref_sentences(draft_md)
    out: dict[str, list[str]] = {}
    for seg in segment_article(final_md):
        if seg.frozen:
            continue  # frozen blocks are compared byte-exact elsewhere
        for s in split_sentences(strip_inline(seg.text).replace("\n", " ")):
            ws = set(words(s))
            if len(words(s)) < MIN_WORDS:
                continue
            if not any(_jacc(ws, r) >= JACCARD for r in ref):
                out.setdefault(seg.section, []).append(s)
    return out


def _reference_section(draft_md: str, section: str) -> str:
    return "\n\n".join(seg.text for seg in segment_article(draft_md) if seg.section == section)


def parse_support(raw: str, n: int) -> dict[int, dict]:
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("reply is not a JSON list")
    out: dict[int, dict] = {}
    for v in data:
        if not isinstance(v, dict) or set(v) - {"i", "verdict", "reason"} or "i" not in v or "verdict" not in v:
            raise ValueError(f"bad entry: {str(v)[:80]}")
        i, verdict = v["i"], v["verdict"]
        if isinstance(i, bool) or not isinstance(i, int) or i in out:
            raise ValueError(f"bad or duplicate claim id {i!r}")
        if verdict not in SUPPORT_VERDICTS:
            raise ValueError(f"bad verdict {verdict!r}")
        if "reason" in v and not isinstance(v["reason"], str):
            raise ValueError("reason must be a string")
        out[i] = v
    if set(out) != set(range(1, n + 1)):
        raise ValueError(f"claim ids {sorted(out)} != expected 1..{n}")
    return out


def _call(model, prompt: str, what: str) -> str:
    kw = {"temperature": 0.0, "max_tokens": 6000} if model.backend == "gateway" else {}
    return model.complete(prompt, **kw)


def _gateway_cat(model) -> Category:
    return Category.GATEWAY_FAILURE if model.backend == "gateway" else Category.MODEL_UNAVAILABLE


def _extract_claims(sentences: list[str], section: str, extractor_spec: str) -> list[str]:
    m = resolve_model(extractor_spec)
    prompt = EXTRACT_PROMPT.format(section=section or "(intro)", text=" ".join(sentences))
    last: Exception | None = None
    for _ in range(2):
        try:
            data = extract_json(_call(m, prompt, "extract"))
            props = data.get("propositions", [])
            if not isinstance(props, list):
                raise ValueError("propositions is not a list")
            return [str(p["claim"]).strip() for p in props if isinstance(p, dict) and p.get("claim") and not is_meta_claim(str(p["claim"]))]
        except GatewayError as e:
            last, cat = e, _gateway_cat(m)
        except (ValueError, AttributeError, TypeError) as e:
            last, cat = e, Category.MALFORMED_MODEL_OUTPUT
    raise _fail(f"added-claim extraction failed for section {section!r}: {str(last)[:200]}", cat)


def check_added(draft_md: str, final_md: str, notes: str | None, extractor_spec: str, judge_spec: str) -> dict:
    """{"sentences": n_new, "claims": n, "unsupported": [{section, claim, reason}]}. Zero model calls when nothing is new."""
    new = new_sentences(draft_md, final_md)
    res = {"sentences": sum(len(v) for v in new.values()), "claims": 0, "unsupported": []}
    if not new:
        return res
    judge = resolve_model(judge_spec)
    notes_txt = (notes or "")[:MAX_NOTES_CHARS]
    for section, sents in new.items():
        claims = _extract_claims(sents, section, extractor_spec)
        if not claims:
            continue
        ref = _reference_section(draft_md, section)
        parts = [p for p in (ref and f"Reference section:\n{ref}", notes_txt and f"Source notes:\n{notes_txt}") if p]
        material = "\n\n".join(parts) or "(none: there is no reference text and no source notes for this section)"
        prompt = SUPPORT_PROMPT.format(claims="\n".join(f"{i}. {c}" for i, c in enumerate(claims, 1)), material=material)
        verdicts, last, cat = None, None, Category.MALFORMED_MODEL_OUTPUT
        for _ in range(2):
            try:
                verdicts = parse_support(_call(judge, prompt, "judge"), len(claims))
                break
            except GatewayError as e:
                last, cat = e, _gateway_cat(judge)
            except ValueError as e:
                last, cat = e, Category.MALFORMED_MODEL_OUTPUT
        if verdicts is None:
            raise _fail(f"added-claim judge failed for section {section!r} after retry: {str(last)[:200]}", cat)
        res["claims"] += len(claims)
        for i, c in enumerate(claims, 1):
            if verdicts[i]["verdict"] == "unsupported":
                res["unsupported"].append({"section": section, "claim": c, "reason": verdicts[i].get("reason", "")})
    return res
