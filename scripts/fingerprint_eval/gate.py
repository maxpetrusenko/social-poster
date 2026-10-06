"""--gate: fast tier on a final article, a HARD pre-publish gate that fails closed.

Exit 0 PASS, 1 FAIL (all checks completed and the content violates policy), 2 ERROR (anything that
prevented reliable evaluation: setup, cache, extraction, judging, embeddings, gate.json write, bugs).
Blocking: any changed/missing claim, any change to frozen blocks (lists, quotes, code, tables, short
paragraphs), any lost heading, image, code block or link, whole-document similarity below the threshold.
Advisory (never fails): author-anchor distance, style shape, n-grams, templates, per-section similarity.
"""
from __future__ import annotations

import copy
import json
import math
import os
import time
from contextlib import contextmanager
from pathlib import Path

from . import metrics as M
from .contracts import AUTHOR_CORPUS_DIR, Category, Result
from .added import check_added
from .claimcheck import check_claims
from .errors import EvaluationError
from .extract_cache import ensure_extraction, extractor_id, sha256
from .gateway import resolve_model
from .guards import frozen_diff, semantic_similarity, structure_preservation
from .judge import identical, judge_claims
from .rewrite import segment_article
from .textutil import core_markdown, load_author_corpus, load_pipeline_corpus

SCHEMA_VERSION = 2
JUDGE_CONFIRM_TELEMETRY = False  # True: re-judge flagged claims twice more and record the votes; they never clear a flag
PASS, FAIL, ERROR = 0, 1, 2
DEFAULT_AUTHOR_CORPUS = Path(__file__).resolve().parents[2] / AUTHOR_CORPUS_DIR  # frozen pre-2023 corpus shipped in the repo


def _read(path: Path, what: str) -> str:
    if not path.is_file():
        raise EvaluationError(f"{what} not found: {path}")
    try:
        return path.read_text()
    except (OSError, UnicodeDecodeError) as e:
        raise EvaluationError(f"cannot read {what} {path}: {e}") from None


@contextmanager
def _timed(timings: dict | None, phase: str):
    """Adds the elapsed wall seconds of the block to timings[phase] (also when the block raises)."""
    t0 = time.monotonic()
    try:
        yield
    finally:
        if timings is not None:
            timings[phase] = round(timings.get(phase, 0.0) + time.monotonic() - t0, 3)


def _check_inputs(article: Path, draft: Path | None, author_dir: Path, threshold: float) -> None:
    if draft is None:
        raise EvaluationError("--draft is required in gate mode (the approved reference to compare the final against)")
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not 0 < threshold <= 1:
        raise EvaluationError(f"--gate-threshold must be a finite number in (0, 1], got {threshold!r}")
    if article.exists() and draft.exists() and article.resolve() == draft.resolve():
        raise EvaluationError("--draft and --article are the same path; a gate against itself proves nothing")
    if not author_dir.is_dir():  # the pipeline corpus is advisory only: a missing one never blocks (see _advisory)
        raise EvaluationError(f"author corpus directory not found: {author_dir}")


def _write(out: Path, gate: dict) -> None:
    tmp = out / "gate.json.tmp"
    tmp.write_text(json.dumps(gate, indent=2))
    os.replace(tmp, out / "gate.json")


def _load_author(author_dir: Path) -> list[tuple[str, str]]:
    """Frozen corpus (.txt, already pre-2023 and length-filtered) or a raw medium export directory (.html)."""
    txt = sorted(author_dir.glob("*.txt"))
    if txt:
        return [(f.name, f.read_text(errors="ignore")) for f in txt]
    return load_author_corpus(author_dir)


def _advisory(final_md: str, draft_md: str, author_dir: Path, pipeline_dir: Path | None, slug: str) -> dict:
    """pipeline_dir None or unreadable: the pipeline comparison is skipped and advisory_errors records why. Never gates."""
    try:
        a_fps = [M.fingerprint(t) for _, t in _load_author(author_dir)]
        errors: list[str] = []
        p_fps: list = []
        if pipeline_dir is not None and pipeline_dir.is_dir():
            p_fps = [M.fingerprint(core_markdown(t)) for _, t in load_pipeline_corpus(pipeline_dir, exclude=slug)]
        if not p_fps:
            errors.append("pipeline corpus unavailable")
        mean, std = M.fw_stats(a_fps + p_fps)
        cen = M.centroid(a_fps)
        fd, ff = M.fingerprint(core_markdown(draft_md)), M.fingerprint(core_markdown(final_md))
        out = {
            "author_anchor": {"signal_family": "author_anchor", "before": M.distance_to(cen, fd, mean, std), "after": M.distance_to(cen, ff, mean, std)},
            "stylistic_structural": {"signal_family": "stylistic_structural", "pipeline_outlier": M.outlier_score(p_fps, ff, mean, std) if p_fps else None,
                                     "repeated_ngram_rate": ff["repeated_ngram_rate"]["mean"], "structural_templates": ff["templates"],
                                     "sentence_length_jsd_draft_vs_final": M.jsd(fd["sent_len_hist"], ff["sent_len_hist"]),
                                     "paragraph_length_jsd_draft_vs_final": M.jsd(fd["para_len_hist"], ff["para_len_hist"])},
        }
        if errors:
            out["advisory_errors"] = errors
        return out
    except (OSError, ValueError, ZeroDivisionError, IndexError, KeyError) as e:
        return {"advisory_error": str(e)[:200], "advisory_errors": [str(e)[:200]]}  # advisory never gates


def _deterministic(struct: dict, fdiff: list[str]) -> tuple[list[str], list[str]]:
    """Cheap checks (no model, no network): reasons and the content categories they imply, cheapest first."""
    reasons: list[str] = []
    cats: list[str] = []
    if fdiff:
        reasons.append("frozen blocks (lists, quotes, code, tables, short paragraphs) differ from the reference:\n" + "\n".join(fdiff))
    for k in ("headings", "images", "codes", "links"):
        if not struct[k]["preserved"]:
            reasons.append(f"{k} not preserved: missing={struct[k]['missing'][:3]}" + (f" added={struct[k]['added'][:3]}" if k == "images" else ""))
    if not struct["links"]["preserved"]:
        cats.append(Category.MISSING_LINK.value)
    if fdiff or any(not struct[k]["preserved"] for k in ("headings", "images", "codes")):
        cats.append(Category.STRUCTURAL_DAMAGE.value)
    return reasons, cats


def _verdict(slug: str, threshold: float, reasons: list[str], cats: list[str], inputs: dict, extractor_spec: str, extraction: str,
             judge_name: str, claims: dict, sem: dict, struct: dict, fdiff: list[str], advisory: dict, partial: bool = False) -> dict:
    """partial: a deterministic early FAIL that never ran the claim and semantic checks. It is labelled as such and can only FAIL."""
    if partial and not reasons:
        raise EvaluationError("internal: a partial evaluation cannot pass")
    g = {"schema_version": SCHEMA_VERSION, "pass": not reasons, "evaluated": "partial" if partial else True, "exit_code": FAIL if reasons else PASS,
            "result": (Result.FAIL if reasons else Result.PASS).value, "error_category": None, "failure_categories": cats,
            "slug": slug, "threshold": threshold, "reasons": reasons, "reference_identical": inputs["reference_identical"], "inputs": inputs,
            "extractor": {"spec": extractor_spec, "id": extractor_id(extractor_spec), "source": extraction}, "judge": judge_name,
            "blocking": {"signal_family": "semantic_retention",
                         "claims": claims, "flagged_claims": claims.get("flagged", []), "semantic_similarity_whole": sem["whole"], "structure": struct,
                         "frozen_blocks_identical": not fdiff},
            "advisory": advisory}
    if partial:
        g["checks_skipped"] = ["claims", "semantic"]
    return g


def evaluate(article: Path, draft: Path | None, author_dir: Path | None, pipeline_dir: Path | None, out: Path, judge_spec: str,
             extractor_spec: str, threshold: float, refresh: bool, identity_shortcut: bool = False, source_notes: Path | None = None,
             reference_bound_by: str | None = None, timings: dict | None = None, allowed_link_removals=None) -> dict:
    """identity_shortcut (release path): a final byte-identical to the reference skips the extractor, judge and embeddings
    (claims judged_by "identity"), but ONLY when reference_bound_by names the rating/prepublish record whose recorded hash
    equals the reference sha256 (the caller, authz, verified that). Otherwise every check runs. Off by default so the
    standalone --gate CLI keeps exercising every model.
    pipeline_dir None: the advisory pipeline comparison is skipped (advisory_errors says so). timings (optional dict) is filled with
    per-phase wall seconds: extraction, judge, added_claims, embeddings, advisory."""
    timings = {} if timings is None else timings
    author_dir = author_dir or DEFAULT_AUTHOR_CORPUS
    _check_inputs(article, draft, author_dir, threshold)
    final_md, draft_md = _read(article, "article"), _read(draft, "draft")
    slug = article.parent.name
    judge = resolve_model(judge_spec)
    inputs = {"article": str(article), "draft": str(draft), "article_sha256": sha256(final_md), "draft_sha256": sha256(draft_md),
              "reference_identical": final_md == draft_md}

    # cheap deterministic checks first: no model call is spent on a candidate that is already structurally broken
    struct = structure_preservation(draft_md, final_md, allowed_link_removals)
    fdiff = frozen_diff(draft_md, final_md)
    det_reasons, det_cats = _deterministic(struct, fdiff)
    advisory: dict = {}
    if det_reasons:
        skipped = {"total": 0, "claims_entailed": 0, "claims_changed": 0, "claims_missing": 0, "claims_unjudged": 0,
                   "judge": None, "skipped": "deterministic_fail", "flagged": []}
        with _timed(timings, "advisory"):
            advisory.update(_advisory(final_md, draft_md, author_dir, pipeline_dir, slug))
        return _verdict(slug, threshold, det_reasons, det_cats, inputs, extractor_spec, "skipped", judge.name, skipped,
                        {"whole": None, "section_min": None, "per_section": {}}, struct, fdiff, advisory, partial=True)
    if identity_shortcut and inputs["reference_identical"] and reference_bound_by:
        ident = {"total": 0, "claims_entailed": 0, "claims_changed": 0, "claims_missing": 0, "claims_unjudged": 0,
                 "judge": "identity", "skipped": "identical", "reference_bound_by": reference_bound_by, "flagged": []}
        with _timed(timings, "advisory"):
            advisory.update(_advisory(final_md, draft_md, author_dir, pipeline_dir, slug))
        g = _verdict(slug, threshold, [], [], inputs, extractor_spec, "skipped", judge.name, ident,
                     {"whole": 1.0, "section_min": 1.0, "per_section": {}}, struct, fdiff, advisory)
        g["reference_bound_by"] = reference_bound_by
        return g

    # deterministic claim checks (numbers, negations, hedge/certainty/quantifier lexicon, removed sentences): no judge call is
    # spent on a candidate that already fails them. One embedding batch at most, and only when a reference sentence is unaligned.
    with _timed(timings, "embeddings"):  # the only model call here is the lexical-miss embedding rescue
        found = check_claims(draft_md, final_md)
    if found:
        n_chg, n_miss = sum(f["verdict"] == "changed" for f in found), sum(f["verdict"] == "missing" for f in found)
        skipped = {"total": 0, "claims_entailed": 0, "claims_changed": n_chg, "claims_missing": n_miss, "claims_unjudged": 0,
                   "judge": None, "skipped": "deterministic_claim_fail", "flagged": found}
        shown = "; ".join(f"[{f['section'] or 'intro'}] {f['reason'] if f['verdict'] == 'changed' else 'removed sentence: ' + f['claim'][:80]}" for f in found[:3])
        with _timed(timings, "advisory"):
            advisory.update(_advisory(final_md, draft_md, author_dir, pipeline_dir, slug))
        g = _verdict(slug, threshold, [f"deterministic claim check: changed={n_chg} missing={n_miss}: {shown}"], [Category.CONTENT_CLAIM_FAILURE.value],
                     inputs, extractor_spec, "skipped", judge.name, skipped, {"whole": None, "section_min": None, "per_section": {}}, struct, fdiff, advisory, partial=True)
        g["checks_skipped"] = ["claim_judge", "added", "semantic"]
        return g

    segs = segment_article(draft_md)
    with _timed(timings, "extraction"):
        extraction = ensure_extraction(segs, draft_md, extractor_spec, out / "gate-extraction.json", refresh)
    prose = [s for s in segs if not s.frozen]  # frozen = headings, code, lists, quotes, short and boilerplate segments (the meta rules)
    uncovered = [s.idx for s in prose if not s.propositions]
    if uncovered:  # never skip a prose segment silently: every non-frozen segment must yield >= 1 claim
        raise EvaluationError(f"reference prose segments with zero extracted claims: {uncovered}", Category.MALFORMED_MODEL_OUTPUT)
    if not prose or sum(len(s.propositions) for s in prose) == 0:
        raise EvaluationError("zero claims extracted from the reference: a vacuous pass is not allowed")

    # claims from the approved draft are judged against the final text of the same section
    by_sec: dict[int, list[str]] = {}
    for fs in segment_article(final_md):
        if not fs.frozen:
            by_sec.setdefault(fs.section_idx, []).append(fs.text)
    jsegs = copy.deepcopy(segs)
    for s in jsegs:
        texts = by_sec.get(s.section_idx, [])
        # a reference segment that survives verbatim in its section is identical: the judge's pre-filter then costs zero calls
        # (comparing the WHOLE section text instead made every segment of a multi-segment section look edited)
        s.output = s.text if any(identical(t, s.text) for t in texts) else "\n\n".join(texts)
    with _timed(timings, "judge"):
        claims = judge_claims(jsegs, judge, strict=True, confirm_telemetry=JUDGE_CONFIRM_TELEMETRY)
    if claims["claims_unjudged"] or claims["total"] == 0:
        raise EvaluationError(f"{claims['claims_unjudged']} unjudged claims, total {claims['total']}")
    with _timed(timings, "embeddings"):
        sem = semantic_similarity(draft_md, final_md)
    notes = _read(source_notes, "source notes") if source_notes else None
    with _timed(timings, "added_claims"):
        added = check_added(draft_md, final_md, notes, extractor_spec, judge_spec)  # claims that exist only in the final

    cats: list[str] = list(det_cats)
    changed = [f"claims changed={claims['claims_changed']} missing={claims['claims_missing']}"] if claims["claims_changed"] or claims["claims_missing"] else []
    if not math.isfinite(sem["whole"]):
        raise EvaluationError("non-finite whole-document similarity")
    low_sem = [f"semantic similarity whole {sem['whole']:.3f} < {threshold}"] if sem["whole"] < threshold else []
    added_reasons = []
    if added["unsupported"]:
        added_reasons.append(f"added unsupported claims={len(added['unsupported'])}: " + "; ".join(f"[{u['section'] or 'intro'}] {u['claim']}" for u in added["unsupported"][:3]))
        cats.append(Category.ADDED_UNSUPPORTED_CLAIM.value)
    if changed or low_sem:
        cats.append(Category.CONTENT_CLAIM_FAILURE.value)
    reasons = changed + det_reasons + added_reasons + low_sem
    low = {h: round(v, 3) for h, v in sem["per_section"].items() if v < threshold}
    if low:
        advisory["sections_below_threshold"] = low  # per-section is advisory until calibrated
    with _timed(timings, "advisory"):
        advisory.update(_advisory(final_md, draft_md, author_dir, pipeline_dir, slug))
    cl = {k: claims[k] for k in ("total", "claims_entailed", "claims_changed", "claims_missing", "claims_unjudged", "judge")}
    cl["flagged"] = claims["flagged"]
    cl["added_unsupported"], cl["added_checked_claims"], cl["added_new_sentences"] = len(added["unsupported"]), added["claims"], added["sentences"]
    g = _verdict(slug, threshold, reasons, cats, inputs, extractor_spec, extraction, judge.name, cl, sem, struct, fdiff, advisory)
    g["blocking"]["flagged_claims"] = claims["flagged"]
    g["blocking"]["claims"].pop("flagged", None)
    g["blocking"]["added_unsupported_claims"] = added["unsupported"]
    g["blocking"]["semantic_section_min"] = sem["section_min"]
    return g


def run_gate(article: Path, draft: Path | None, author_dir: Path | None, pipeline_dir: Path | None, out: Path, judge_spec: str,
             threshold: float, extractor_spec: str, refresh: bool = False, identity_shortcut: bool = False, source_notes: Path | None = None,
             reference_bound_by: str | None = None, allowed_link_removals=None) -> int:
    """Never raises: every failure to evaluate, including bugs, is exit 2. gate.json carries `timings` (seconds per phase, also on ERROR)."""
    timings: dict = {}
    t0 = time.monotonic()
    try:
        out.mkdir(parents=True, exist_ok=True)
        (out / "gate.json").unlink(missing_ok=True)  # a stale verdict must never outlive a failed run
        gate = evaluate(article, draft, author_dir, pipeline_dir, out, judge_spec, extractor_spec, threshold, refresh, identity_shortcut, source_notes, reference_bound_by, timings, allowed_link_removals)
    except Exception as e:  # noqa: BLE001  fail closed
        msg = f"{type(e).__name__}: {e}" if not isinstance(e, EvaluationError) else str(e)
        cat = getattr(e, "category", None)  # errors.EvaluationError carries a Category (older builds: absent)
        gate = {"schema_version": SCHEMA_VERSION, "pass": False, "evaluated": False, "exit_code": ERROR, "result": Result.ERROR.value,
                "error_category": getattr(cat, "value", cat) or Category.UNKNOWN_ERROR.value, "failure_categories": [],
                "reasons": [f"could not evaluate: {msg[:400]}"]}
    gate["timings"] = {**{k: timings.get(k, 0.0) for k in ("extraction", "judge", "added_claims", "embeddings", "advisory")}, **timings,
                       "total": round(time.monotonic() - t0, 3)}
    try:
        _write(out, gate)
    except Exception as e:  # noqa: BLE001
        print("GATE ERROR: cannot write gate.json:", str(e)[:200])
        return ERROR
    if gate["exit_code"] == ERROR:
        print("GATE ERROR:", gate["reasons"][0])
    else:
        print("GATE PASS" if gate["pass"] else "GATE FAIL: " + "; ".join(gate["reasons"]))
    return gate["exit_code"]
