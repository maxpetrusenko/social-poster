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
from pathlib import Path

from . import metrics as M
from .errors import EvaluationError
from .extract_cache import ensure_extraction, extractor_id, sha256
from .gateway import resolve_model
from .guards import frozen_diff, semantic_similarity, structure_preservation
from .judge import judge_claims
from .rewrite import segment_article
from .textutil import core_markdown, load_author_corpus, load_pipeline_corpus

SCHEMA_VERSION = 2
PASS, FAIL, ERROR = 0, 1, 2


def _read(path: Path, what: str) -> str:
    if not path.is_file():
        raise EvaluationError(f"{what} not found: {path}")
    try:
        return path.read_text()
    except (OSError, UnicodeDecodeError) as e:
        raise EvaluationError(f"cannot read {what} {path}: {e}") from None


def _check_inputs(article: Path, draft: Path | None, author_dir: Path, pipeline_dir: Path, threshold: float) -> None:
    if draft is None:
        raise EvaluationError("--draft is required in gate mode (the approved reference to compare the final against)")
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not 0 < threshold <= 1:
        raise EvaluationError(f"--gate-threshold must be a finite number in (0, 1], got {threshold!r}")
    if article.exists() and draft.exists() and article.resolve() == draft.resolve():
        raise EvaluationError("--draft and --article are the same path; a gate against itself proves nothing")
    for d, what in ((author_dir, "author corpus"), (pipeline_dir, "pipeline corpus")):
        if not d.is_dir():
            raise EvaluationError(f"{what} directory not found: {d}")


def _write(out: Path, gate: dict) -> None:
    tmp = out / "gate.json.tmp"
    tmp.write_text(json.dumps(gate, indent=2))
    os.replace(tmp, out / "gate.json")


def _advisory(final_md: str, draft_md: str, author_dir: Path, pipeline_dir: Path, slug: str) -> dict:
    try:
        a_fps = [M.fingerprint(t) for _, t in load_author_corpus(author_dir)]
        p_fps = [M.fingerprint(core_markdown(t)) for _, t in load_pipeline_corpus(pipeline_dir, exclude=slug)]
        mean, std = M.fw_stats(a_fps + p_fps)
        cen = M.centroid(a_fps)
        fd, ff = M.fingerprint(core_markdown(draft_md)), M.fingerprint(core_markdown(final_md))
        return {
            "author_anchor": {"signal_family": "author_anchor", "before": M.distance_to(cen, fd, mean, std), "after": M.distance_to(cen, ff, mean, std)},
            "stylistic_structural": {"signal_family": "stylistic_structural", "pipeline_outlier": M.outlier_score(p_fps, ff, mean, std),
                                     "repeated_ngram_rate": ff["repeated_ngram_rate"]["mean"], "structural_templates": ff["templates"],
                                     "sentence_length_jsd_draft_vs_final": M.jsd(fd["sent_len_hist"], ff["sent_len_hist"]),
                                     "paragraph_length_jsd_draft_vs_final": M.jsd(fd["para_len_hist"], ff["para_len_hist"])},
        }
    except (OSError, ValueError, ZeroDivisionError, IndexError, KeyError) as e:
        return {"advisory_error": str(e)[:200]}  # advisory never gates


def evaluate(article: Path, draft: Path | None, author_dir: Path, pipeline_dir: Path, out: Path, judge_spec: str,
             extractor_spec: str, threshold: float, refresh: bool) -> dict:
    _check_inputs(article, draft, author_dir, pipeline_dir, threshold)
    final_md, draft_md = _read(article, "article"), _read(draft, "draft")
    slug = article.parent.name
    judge = resolve_model(judge_spec)
    inputs = {"article": str(article), "draft": str(draft), "article_sha256": sha256(final_md), "draft_sha256": sha256(draft_md),
              "reference_identical": final_md == draft_md}

    segs = segment_article(draft_md)
    extraction = ensure_extraction(segs, draft_md, extractor_spec, out / "gate-extraction.json", refresh)
    prose = [s for s in segs if not s.frozen]
    if not prose or sum(len(s.propositions) for s in prose) == 0:
        raise EvaluationError("zero claims extracted from the reference: a vacuous pass is not allowed")

    # claims from the approved draft are judged against the final text of the same section
    by_sec: dict[int, list[str]] = {}
    for fs in segment_article(final_md):
        if not fs.frozen:
            by_sec.setdefault(fs.section_idx, []).append(fs.text)
    jsegs = copy.deepcopy(segs)
    for s in jsegs:
        s.output = "\n\n".join(by_sec.get(s.section_idx, []))
    claims = judge_claims(jsegs, judge, strict=True)
    if claims["claims_unjudged"] or claims["total"] == 0:
        raise EvaluationError(f"{claims['claims_unjudged']} unjudged claims, total {claims['total']}")
    sem = semantic_similarity(draft_md, final_md)
    struct = structure_preservation(draft_md, final_md)
    fdiff = frozen_diff(draft_md, final_md)

    reasons: list[str] = []
    if claims["claims_changed"] or claims["claims_missing"]:
        reasons.append(f"claims changed={claims['claims_changed']} missing={claims['claims_missing']}")
    if fdiff:
        reasons.append("frozen blocks (lists, quotes, code, tables, short paragraphs) differ from the reference:\n" + "\n".join(fdiff))
    for k in ("headings", "images", "codes", "links"):
        if not struct[k]["preserved"]:
            reasons.append(f"{k} not preserved: missing={struct[k]['missing'][:3]}" + (f" added={struct[k]['added'][:3]}" if k == "images" else ""))
    if not math.isfinite(sem["whole"]):
        raise EvaluationError("non-finite whole-document similarity")
    if sem["whole"] < threshold:
        reasons.append(f"semantic similarity whole {sem['whole']:.3f} < {threshold}")
    advisory: dict = {}
    low = {h: round(v, 3) for h, v in sem["per_section"].items() if v < threshold}
    if low:
        advisory["sections_below_threshold"] = low  # per-section is advisory until calibrated
    advisory.update(_advisory(final_md, draft_md, author_dir, pipeline_dir, slug))

    return {"schema_version": SCHEMA_VERSION, "pass": not reasons, "evaluated": True, "exit_code": FAIL if reasons else PASS,
            "slug": slug, "threshold": threshold, "reasons": reasons, "reference_identical": inputs["reference_identical"], "inputs": inputs,
            "extractor": {"spec": extractor_spec, "id": extractor_id(extractor_spec), "source": extraction}, "judge": judge.name,
            "blocking": {"signal_family": "semantic_retention",
                         "claims": {k: claims[k] for k in ("total", "claims_entailed", "claims_changed", "claims_missing", "claims_unjudged", "judge")},
                         "flagged_claims": claims["flagged"], "semantic_similarity_whole": sem["whole"], "structure": struct,
                         "frozen_blocks_identical": not fdiff},
            "advisory": advisory}


def run_gate(article: Path, draft: Path | None, author_dir: Path, pipeline_dir: Path, out: Path, judge_spec: str,
             threshold: float, extractor_spec: str, refresh: bool = False) -> int:
    """Never raises: every failure to evaluate, including bugs, is exit 2."""
    try:
        out.mkdir(parents=True, exist_ok=True)
        (out / "gate.json").unlink(missing_ok=True)  # a stale verdict must never outlive a failed run
        gate = evaluate(article, draft, author_dir, pipeline_dir, out, judge_spec, extractor_spec, threshold, refresh)
    except Exception as e:  # noqa: BLE001  fail closed
        msg = f"{type(e).__name__}: {e}" if not isinstance(e, EvaluationError) else str(e)
        gate = {"schema_version": SCHEMA_VERSION, "pass": False, "evaluated": False, "exit_code": ERROR, "reasons": [f"could not evaluate: {msg[:400]}"]}
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
