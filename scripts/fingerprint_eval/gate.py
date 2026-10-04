"""--gate: fast tier on a final article. Blocking: claims, structure, semantic floor.
Advisory (never fails): author-anchor distance, style shape, n-grams, templates.
Exit 0 pass, 1 blocking failure, 2 could not evaluate (never a silent pass)."""
from __future__ import annotations

import copy
import json
from pathlib import Path

from . import metrics as M
from .gateway import GatewayError, resolve_model
from .guards import judge_claims, semantic_similarity, structure_preservation
from .rewrite import EXTRACTOR, extract_propositions, is_meta_claim, segment_article
from .textutil import core_markdown, load_author_corpus, load_pipeline_corpus


def run_gate(article: Path, draft: Path, author_dir: Path, pipeline_dir: Path, out: Path, judge_spec: str, threshold: float) -> int:
    final_md, draft_md = article.read_text(), draft.read_text()
    slug = article.parent.name
    reasons: list[str] = []
    advisory: dict = {"same_file_as_draft": article.resolve() == draft.resolve()}
    try:
        segs = segment_article(draft_md)
        cache = out / "gate-extraction.json"
        if cache.exists():
            saved = json.loads(cache.read_text())
            for s in segs:
                if str(s.idx) in saved:
                    s.propositions = [q for q in saved[str(s.idx)]["propositions"] if not is_meta_claim(q["claim"])]
        else:
            for s in segs:
                if not s.frozen:
                    extract_propositions(s, EXTRACTOR)
            cache.write_text(json.dumps({str(s.idx): {"propositions": s.propositions} for s in segs if s.propositions}, indent=1, ensure_ascii=False))
        # claims from the approved draft are judged against the final text of the same section
        by_sec: dict[int, list[str]] = {}
        for fs in segment_article(final_md):
            if not fs.frozen:
                by_sec.setdefault(fs.section_idx, []).append(fs.text)
        jsegs = copy.deepcopy(segs)
        for s in jsegs:
            s.output = "\n\n".join(by_sec.get(s.section_idx, []))
        claims = judge_claims(jsegs, resolve_model(judge_spec))
        sem = semantic_similarity(draft_md, final_md)
        struct = structure_preservation(draft_md, final_md)
    except (GatewayError, OSError) as e:
        gate = {"pass": False, "evaluated": False, "reasons": [f"could not evaluate: {str(e)[:300]}"]}
        (out / "gate.json").write_text(json.dumps(gate, indent=2))
        print("GATE ERROR:", gate["reasons"][0])
        return 2

    if claims["claims_changed"] or claims["claims_missing"]:
        reasons.append(f"claims changed={claims['claims_changed']} missing={claims['claims_missing']}")
    if claims["claims_unjudged"]:
        reasons.append(f"{claims['claims_unjudged']} claims unjudged (cannot verify)")
    for k in ("headings", "images", "codes", "links"):
        if not struct[k]["preserved"]:
            reasons.append(f"{k} not preserved: {struct[k]['missing'][:3]}")
    if sem["whole"] < threshold:
        reasons.append(f"semantic similarity whole {sem['whole']:.3f} < {threshold}")
    low = {h: round(v, 3) for h, v in sem["per_section"].items() if v < threshold}
    if low:
        advisory["sections_below_threshold"] = low  # per-section is advisory until calibrated

    try:
        a_fps = [M.fingerprint(t) for _, t in load_author_corpus(author_dir)]
        p_fps = [M.fingerprint(core_markdown(t)) for _, t in load_pipeline_corpus(pipeline_dir, exclude=slug)]
        mean, std = M.fw_stats(a_fps + p_fps)
        cen = M.centroid(a_fps)
        fd, ff = M.fingerprint(core_markdown(draft_md)), M.fingerprint(core_markdown(final_md))
        advisory.update({
            "author_anchor": {"signal_family": "author_anchor", "before": M.distance_to(cen, fd, mean, std), "after": M.distance_to(cen, ff, mean, std)},
            "stylistic_structural": {"signal_family": "stylistic_structural", "pipeline_outlier": M.outlier_score(p_fps, ff, mean, std),
                                     "repeated_ngram_rate": ff["repeated_ngram_rate"]["mean"], "structural_templates": ff["templates"],
                                     "sentence_length_jsd_draft_vs_final": M.jsd(fd["sent_len_hist"], ff["sent_len_hist"]),
                                     "paragraph_length_jsd_draft_vs_final": M.jsd(fd["para_len_hist"], ff["para_len_hist"])},
        })
    except (OSError, ValueError, ZeroDivisionError) as e:
        advisory["advisory_error"] = str(e)[:200]

    gate = {"pass": not reasons, "evaluated": True, "slug": slug, "threshold": threshold, "reasons": reasons,
            "blocking": {"signal_family": "semantic_retention", "claims": {k: claims[k] for k in ("total", "claims_entailed", "claims_changed", "claims_missing", "claims_unjudged", "judge")},
                         "flagged_claims": claims["flagged"], "semantic_similarity_whole": sem["whole"], "structure": struct},
            "advisory": advisory}
    (out / "gate.json").write_text(json.dumps(gate, indent=2))
    print(("GATE PASS" if gate["pass"] else "GATE FAIL: " + "; ".join(reasons)))
    return 0 if gate["pass"] else 1
