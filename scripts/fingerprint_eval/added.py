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
from .rewrite import Segment, is_meta_claim, request_extraction, segment_article
from .textutil import Block, split_sentences, strip_inline, words

JACCARD = 0.8
MIN_WORDS = 5  # `is_factual` cut for reference coverage; new sentences are all checked (short ones through `_stylistic_echo` first)
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


NUM_RE = re.compile(r"\d[\d,.]*\d|\d")
NUMBER_WORDS = frozenset("""zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen
nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion half double triple twice
once first second third fourth fifth tenth""".split())
TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'\u2019\-]*")
NEGATIONS = frozenset({"not", "no", "never", "none", "neither", "nor", "cannot", "without", "nothing", "nobody", "nowhere", "hardly", "barely"})
PRONOUN_I = re.compile(r"^I(?:['\u2019](?:m|ll|ve|d))?$")


def _signature(sentence: str) -> tuple[frozenset, frozenset, frozenset]:
    """(numbers, negations, named entities): what a fuzzy word match cannot see. Entities = capitalised tokens that are
    not sentence-initial (and not the pronoun I); negations include n't contractions."""
    toks = TOKEN_RE.findall(sentence)
    nums = frozenset([m.group(0).strip(",.") for m in NUM_RE.finditer(sentence)] + [t.lower() for t in toks if t.lower() in NUMBER_WORDS])
    negs = frozenset(t.lower().replace("\u2019", "'") for t in toks if t.lower().replace("\u2019", "'") in NEGATIONS or t.lower().replace("\u2019", "'").endswith("n't"))
    ents = frozenset(t.lower() for t in toks[1:] if t[0].isupper() and not PRONOUN_I.match(t))
    return nums, negs, ents


def _is_factual(sentence: str) -> bool:
    """Long enough to carry a claim, or short but carrying a number, a proper noun or a negation."""
    if len(words(sentence)) >= MIN_WORDS:
        return True
    return any(_signature(sentence))


def _ref_sentences(md: str) -> list[tuple[set, tuple]]:
    out = []
    for seg in segment_article(md):
        for b in seg.blocks:
            if b.kind == "heading":
                continue
            for ln in (b.text.split("\n") if b.kind == "list" else [b.text]):
                for s in split_sentences(strip_inline(ln)):
                    out.append((set(words(s)), _signature(s)))
    return out


def _stylistic_echo(sentence: str, ref_tokens: set[str]) -> bool:
    """Short non-factual sentences (punctuation, interjections, 'They won.'): stylistic only if they carry no content token or
    every content token already occurs in the same reference section. Anything else goes to the model."""
    toks = _content_tokens(sentence)
    return not toks or toks <= ref_tokens


def new_sentences(draft_md: str, final_md: str) -> dict[str, list[str]]:
    """{section: [sentence, ...]} for final prose sentences with no fuzzy counterpart anywhere in the reference.
    A counterpart needs word overlap >= JACCARD AND identical numbers, negations and named entities. No length exemption:
    sentences that are short and carry no number, proper noun or negation are skipped only when `_stylistic_echo`."""
    ref = _ref_sentences(draft_md)
    out: dict[str, list[str]] = {}
    sec_tokens: dict[str, set[str]] = {}
    for seg in segment_article(final_md):
        if seg.frozen:
            continue  # frozen blocks are compared byte-exact elsewhere
        for s in split_sentences(strip_inline(seg.text).replace("\n", " ")):
            ws, sig = set(words(s)), _signature(s)
            if any(_jacc(ws, r) >= JACCARD and sig == rsig for r, rsig in ref):
                continue
            if not _is_factual(s):
                if seg.section not in sec_tokens:
                    sec_tokens[seg.section] = _content_tokens(strip_inline(_reference_section(draft_md, seg.section)))
                if _stylistic_echo(s, sec_tokens[seg.section]):
                    continue
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


_CLAIM_STOP = frozenset("the a an and or but of to in on at for with by from as is are was were be been it its this that these those he she they we you i his her their our your not no".split())
COVER = 0.5


def _content_tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower().replace("\u2019", "'")) if t not in _CLAIM_STOP}


def sentence_covered(sentence: str, claims: list[str], tagged: bool = False) -> bool:
    """Sentence-side coverage: the extractor tagged it, or >= COVER of the sentence's content tokens occur in ONE claim
    (so a one-token claim cannot cover a long sentence)."""
    if tagged:
        return True
    st = _content_tokens(sentence)
    return bool(st) and any(len(st & _content_tokens(c)) / len(st) >= COVER for c in claims)


def uncovered_sentences(sentences: list[str], claims: list[str], tagged_ids: set[int] | frozenset = frozenset()) -> list[str]:
    """Sentences (ids are 1-based into `sentences`) with no tagging proposition and no claim covering >= COVER of their tokens."""
    return [s for i, s in enumerate(sentences, 1) if not sentence_covered(s, claims, i in tagged_ids)]


def _extract_claims(sentences: list[str], section: str, extractor_spec: str) -> tuple[list[str], set[int]]:
    """(claims, tagged sentence ids). Extraction runs over the new sentences only."""
    try:
        _, props = request_extraction(sentences, section, extractor_spec)
    except GatewayError as e:
        if "empty propositions" in str(e):
            raise _fail(f"added-claim extraction returned no factual claims for {len(sentences)} new sentence(s) in section {section!r}", Category.MALFORMED_MODEL_OUTPUT) from None
        raise _fail(f"added-claim extraction failed for section {section!r}: {str(e)[:200]}", e.category) from None
    claims = [p["claim"] for p in props]
    tagged = {i for p in props for i in p.get("sentence_ids", [])}
    return claims, tagged


def check_added(draft_md: str, final_md: str, notes: str | None, extractor_spec: str, judge_spec: str) -> dict:
    """{"sentences": n_new, "claims": n, "unsupported": [{section, claim, reason}]}. Zero model calls when nothing is new."""
    new = new_sentences(draft_md, final_md)
    res = {"sentences": sum(len(v) for v in new.values()), "claims": 0, "unsupported": []}
    if not new:
        return res
    judge = resolve_model(judge_spec)
    notes_txt = (notes or "")[:MAX_NOTES_CHARS]
    for section, sents in new.items():
        claims, tagged = _extract_claims(sents, section, extractor_spec)
        if not claims:  # new factual sentences exist: an empty post-filter extraction is a failed extraction, never a pass
            raise _fail(f"added-claim extraction returned no factual claims for {len(sents)} new sentence(s) in section {section!r}", Category.MALFORMED_MODEL_OUTPUT)
        gaps = uncovered_sentences(sents, claims, tagged)
        if gaps:  # sentence-to-claim coverage: every new sentence maps to >= 1 claim
            raise _fail(f"added-claim extraction left {len(gaps)} new sentence(s) without a claim in section {section!r}: {gaps[0][:100]!r}", Category.MALFORMED_MODEL_OUTPUT)
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
