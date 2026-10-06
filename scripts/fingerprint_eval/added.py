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
from .judge import ask_chunked, normalize, parse_entries
from .rewrite import Segment, is_meta_claim, request_extraction, segment_article
from .textutil import Block, parallel_map, split_sentences, strip_inline, words

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


def _ref_sentences(md: str) -> list[tuple[set, tuple, set[str]]]:
    """(word set, signature, content tokens) per reference prose sentence, in document order."""
    out = []
    for seg in segment_article(md):
        for b in seg.blocks:
            if b.kind == "heading":
                continue
            for ln in (b.text.split("\n") if b.kind == "list" else [b.text]):
                for s in split_sentences(strip_inline(ln)):
                    out.append((set(words(s)), _signature(s), _content_tokens(s)))
    return out


def _ref_texts(md: str) -> list[str]:
    """The sentences behind `_ref_sentences`, same order."""
    return [s for seg in segment_article(md) for b in seg.blocks if b.kind != "heading"
            for ln in (b.text.split("\n") if b.kind == "list" else [b.text]) for s in split_sentences(strip_inline(ln))]


MERGE_MIN_TOKENS = 6   # a merged sentence is long; shorter ones recombining two reference sentences are treated as new
MERGE_COVER = 0.85


def _within(sig: tuple, *refs: tuple) -> bool:
    """Every number, negation and named entity of `sig` occurs in one of the reference signatures."""
    return all(sig[k] <= frozenset().union(*(r[k] for r in refs)) for k in range(3))


def _recombined(ct: set[str], sig: tuple, ref: list[tuple[set, tuple, set[str]]], retained: set[int]) -> bool:
    """A final sentence that only re-cuts reference sentences is not new: a fragment of ONE reference sentence (split: all its
    content tokens occur there) or a merge of two ADJACENT ones (>= MERGE_COVER of its tokens occur in their union), in both cases
    adding no number, negation or entity, and only over reference sentences that no final sentence retains (a sentence that is
    still there whole was not split or merged, so a new sentence reusing its words is an addition). Changed numbers, negations and
    hedges are claimcheck's job; this only stops a benign split or merge from being sent to the extractor as an unsupported addition."""
    if len(ct) < 2:
        return False
    if any(i not in retained and ct <= rct and _within(sig, rsig) for i, (_, rsig, rct) in enumerate(ref)):
        return True
    return len(ct) >= MERGE_MIN_TOKENS and any(i not in retained and i + 1 not in retained and len(ct & (a[2] | b[2])) / len(ct) >= MERGE_COVER and _within(sig, a[1], b[1])
                                                for i, (a, b) in enumerate(zip(ref, ref[1:])))


def _stylistic_echo(sentence: str, ref_tokens: set[str]) -> bool:
    """Rhythm fragments only ('Notice it.', 'Yes.'): at most ONE content token, already in the same reference section, and
    (the caller guarantees) no number, proper noun or negation. Two or more content tokens can recombine reused words into a
    new claim ('The patient died.'), so they always go to the extractor and the support judge."""
    toks = _content_tokens(sentence)
    return len(toks) <= 1 and toks <= ref_tokens


def new_sentences(draft_md: str, final_md: str) -> dict[str, list[str]]:
    """{section: [sentence, ...]} for final prose sentences with no fuzzy counterpart anywhere in the reference.
    A counterpart needs word overlap >= JACCARD AND identical numbers, negations and named entities. No length exemption:
    sentences that are short and carry no number, proper noun or negation are skipped only when `_stylistic_echo`."""
    ref = _ref_sentences(draft_md)
    ref_text = _ref_texts(draft_md)
    out: dict[str, list[str]] = {}
    sec_tokens: dict[str, set[str]] = {}
    finals = [(seg.section, s) for seg in segment_article(final_md) if not seg.frozen  # frozen blocks are compared byte-exact elsewhere
              for b in seg.blocks for ln in (b.text.split("\n") if b.kind == "list" else [b.text])
              for s in split_sentences(strip_inline(ln).replace("\n", " "))]
    final_norm = {normalize(s) for _, s in finals}
    retained = {i for i, text in enumerate(ref_text) if normalize(text) in final_norm}  # whole and verbatim: not a split or a merge
    for section, s in finals:
        ws, sig = set(words(s)), _signature(s)
        if any(_jacc(ws, r) >= JACCARD and sig == rsig for r, rsig, _ in ref):
            continue
        if _recombined(_content_tokens(s), sig, ref, retained):
            continue
        if not _is_factual(s):
            if section not in sec_tokens:
                sec_tokens[section] = _content_tokens(strip_inline(_reference_section(draft_md, section)))
            if _stylistic_echo(s, sec_tokens[section]):
                continue
        out.setdefault(section, []).append(s)
    return out


def _reference_section(draft_md: str, section: str) -> str:
    return "\n\n".join(seg.text for seg in segment_article(draft_md) if seg.section == section)


def parse_support(raw: str, n: int) -> dict[int, dict]:
    return parse_entries(raw, n, SUPPORT_VERDICTS, {"i", "verdict", "reason"}, ("reason",))


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
    def check_section(item: tuple[str, list[str]]) -> tuple[list[str], dict[int, dict]]:
        section, sents = item
        claims, tagged = _extract_claims(sents, section, extractor_spec)
        if not claims:  # new factual sentences exist: an empty post-filter extraction is a failed extraction, never a pass
            raise _fail(f"added-claim extraction returned no factual claims for {len(sents)} new sentence(s) in section {section!r}", Category.MALFORMED_MODEL_OUTPUT)
        gaps = uncovered_sentences(sents, claims, tagged)
        if gaps:  # sentence-to-claim coverage: every new sentence maps to >= 1 claim
            raise _fail(f"added-claim extraction left {len(gaps)} new sentence(s) without a claim in section {section!r}: {gaps[0][:100]!r}", Category.MALFORMED_MODEL_OUTPUT)
        ref = _reference_section(draft_md, section)
        parts = [p for p in (ref and f"Reference section:\n{ref}", notes_txt and f"Source notes:\n{notes_txt}") if p]
        material = "\n\n".join(parts) or "(none: there is no reference text and no source notes for this section)"

        def ask(sub):
            return _call(judge, SUPPORT_PROMPT.format(claims="\n".join(f"{i}. {c}" for i, c in enumerate(sub, 1)), material=material), "judge")

        try:
            verdicts, _ = ask_chunked(claims, ask, parse_support)
        except GatewayError as e:
            raise _fail(f"added-claim judge failed for section {section!r} after retry: {str(e)[:200]}", _gateway_cat(judge)) from None
        except ValueError as e:
            raise _fail(f"added-claim judge failed for section {section!r} after retry: {str(e)[:200]}", Category.MALFORMED_MODEL_OUTPUT) from None
        return claims, verdicts

    items = list(new.items())
    # sections run on a bounded pool; results are merged in section order (any worker exception re-raises: fail closed)
    for (section, _), (claims, verdicts) in zip(items, parallel_map(check_section, items)):
        res["claims"] += len(claims)
        for i, c in enumerate(claims, 1):
            if verdicts[i]["verdict"] == "unsupported":
                res["unsupported"].append({"section": section, "claim": c, "reason": verdicts[i].get("reason", "")})
    return res
