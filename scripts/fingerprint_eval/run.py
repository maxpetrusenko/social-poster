"""CLI: python -m scripts.fingerprint_eval.run --article A --author-corpus D --pipeline-corpus D --out experiments/<slug>/

Eval-only. Reads the article, writes candidates + metrics next to --out. Never publishes.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from . import metrics as M
from .errors import EvaluationError
from .gateway import GatewayError, Model, child_env, resolve_model
from .extract_cache import ensure_extraction
from .guards import semantic_similarity, structure_preservation
from .judge import judge_claims
from .report import top_diffs, write_report
from .rewrite import EXTRACTOR, Segment, assert_different_family, assert_same_family, rewrite_article, segment_article
from .textutil import core_markdown, load_author_corpus, load_pipeline_corpus

WATERMARK = {"signal_family": "watermark", "research_only": True, "run": False, "reason": "no vendor keys; GPT/Claude text watermark not verifiable"}


METRIC_GROUPS = {
    "style_shape": {"signal_family": "stylistic_structural", "keys": ["sentence_length_jsd", "paragraph_length_jsd", "repeated_ngram_rate", "structural_templates", "pipeline_corpus_outlier"]},
    "author_distance": {"signal_family": "author_anchor", "keys": ["author_style_distance_before", "author_style_distance_after", "author_style_distance_delta"]},
    "meaning": {"signal_family": "semantic_retention", "keys": ["semantic_similarity", "claims_preserved", "claims_changed", "claims_missing", "structure_preserved"]},
    "watermark_tests": {"signal_family": "watermark", "keys": ["watermark_tests"]},
    "provenance": {"signal_family": "provenance", "keys": ["provenance"]},
}


DOPPLER_ENV_KEYS = ("PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR",
                    "DOPPLER_TOKEN", "DOPPLER_CONFIG_DIR", "DOPPLER_PROJECT", "DOPPLER_CONFIG", "DOPPLER_ENABLE_VERSION_CHECK")


def doppler_env(environ=None) -> dict[str, str]:
    """Allowlisted env for the doppler child: OPENAI_/ANTHROPIC_ keys and every other secret in this process never reach it."""
    return child_env(DOPPLER_ENV_KEYS, environ)


def load_gateway_key() -> None:
    """Fill LLM_GATEWAY_API_KEY from Doppler into this process env only (never printed)."""
    if os.environ.get("LLM_GATEWAY_API_KEY"):
        return
    env = {**doppler_env(), "HTTPS_PROXY": "", "HTTP_PROXY": ""}
    p = subprocess.run(["doppler", "secrets", "get", "LLM_GATEWAY_API_KEY", "-p", "api_keys", "-c", "dev", "--plain"], capture_output=True, text=True, env=env)
    if p.returncode == 0 and p.stdout.strip():
        os.environ["LLM_GATEWAY_API_KEY"] = p.stdout.strip()


def infer_writer(version_json: Path | None, override: str | None) -> dict:
    if override:
        return {"model": override, "family": _fam(override)}
    if version_json and version_json.exists():
        v = json.loads(version_json.read_text())
        label = " ".join(str(v.get(k, "")) for k in ("ratingModel", "ratingProvider"))
        if re.search(r"codex|gpt|openai", label, re.I):
            return {"model": "codex", "family": "openai", "evidence": f"version.json ratingModel={v.get('ratingModel')!r}"}
    raise SystemExit("cannot infer writer family; pass --writer MODEL")


def _fam(model: str) -> str:
    from .gateway import family_of
    return family_of(model)


def corpus_fps(docs: list[tuple[str, str]], core: bool) -> list[dict]:
    return [M.fingerprint(core_markdown(t) if core else t) for _, t in docs]


def run_rewriter(spec: str, md: str, segs_template: list[Segment], writer: dict, ctx: dict, judge: Model, outdir: Path, control: bool = False) -> tuple[dict, list[Segment]]:
    import copy
    rewriter = resolve_model(spec)
    if control:
        assert_same_family(writer["family"], rewriter.family)
    else:
        assert_different_family(writer["family"], rewriter.family)
    segs = copy.deepcopy(segs_template)
    text = rewrite_article(md, rewriter, writer["family"], segs, control=control)
    label = ("control-" if control else "") + rewriter.name
    (outdir / f"rewrite-{re.sub(r'[^A-Za-z0-9.-]+', '-', label)}.md").write_text(text)
    fp = M.fingerprint(core_markdown(text))
    sh = M.shift(ctx["author_centroid"], ctx["orig_fp"], fp, ctx["fw_mean"], ctx["fw_std"])
    claims = judge_claims(segs, judge)
    judged = claims["total"] - claims["claims_unjudged"]
    res = {
        "rewriter": {"model": label, "family": rewriter.family, "backend": rewriter.backend},
        "control": control,
        "transform": "same-family A->A control rewrite" if control else "cross-family A->B proposition regeneration",
        "semantic_similarity": semantic_similarity(md, text),
        "claims_total": claims["total"],
        "claims_preserved": claims["claims_entailed"],
        "claims_changed": claims["claims_changed"],
        "claims_missing": claims["claims_missing"],
        "claims_unjudged": claims["claims_unjudged"],
        "flagged_claims": claims["flagged"],
        "judge": claims["judge"],
        "structure_preserved": structure_preservation(md, text),
        "author_style_distance_after": sh["after"],
        "author_style_distance_delta": sh["delta"],
        "pipeline_corpus_outlier": M.outlier_score(ctx["pipe_fps"], fp, ctx["fw_mean"], ctx["fw_std"]),
        "repeated_ngram_rate": {"before": ctx["orig_fp"]["repeated_ngram_rate"]["mean"], "after": fp["repeated_ngram_rate"]["mean"]},
        "sentence_length_jsd": sh["original_vs_rewrite"]["sentence_length_jsd"],
        "paragraph_length_jsd": sh["original_vs_rewrite"]["paragraph_length_jsd"],
        "structural_templates": fp["templates"],
        "n_words": fp["n_words"],
    }
    return res, segs


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--article", required=True, type=Path)
    ap.add_argument("--author-corpus", required=True, type=Path)
    ap.add_argument("--pipeline-corpus", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--writer", help="writer model name (default: inferred from version.json beside the article)")
    ap.add_argument("--rewriters", default="qwen3:8b,claude:sonnet")
    ap.add_argument("--control", default="", help="eval-only same-family control rewriter, e.g. 'codex' (A->A). Labeled control in outputs; guard stays on for --rewriters")
    ap.add_argument("--gate", action="store_true", help="fast-tier final review gate: exit 1 on blocking failure, writes gate.json; no rewriting")
    ap.add_argument("--draft", type=Path, help="gate: REQUIRED approved reference draft to compare the final against; must be a different path from --article")
    ap.add_argument("--gate-threshold", type=float, default=0.90, help="gate: min whole-document semantic similarity")
    ap.add_argument("--extractor", default=EXTRACTOR, help="proposition extractor (gateway model or claude:<alias>)")
    ap.add_argument("--tier", choices=["fast", "research"], default="fast")
    ap.add_argument("--judge", default="qwen3:8b", help="claim judge model (gateway name, or claude:<alias>)")
    ap.add_argument("--refresh-extraction", action="store_true")
    a = ap.parse_args(argv)

    if a.gate:  # before anything else: a gate run is never short-circuited into a pass
        if a.tier != "fast":
            print("GATE ERROR: --gate runs the fast tier only")
            return 2
        from .gate import run_gate
        load_gateway_key()
        return run_gate(a.article, a.draft, a.author_corpus, a.pipeline_corpus, a.out, a.judge, a.gate_threshold, a.extractor, a.refresh_extraction)
    a.out.mkdir(parents=True, exist_ok=True)
    if a.tier == "research":
        stub = {"tier": "research", "run": False, "reason": "stub: detectors and watermark checks are scheduled nightly later, not part of the per-article fast tier",
                "planned": ["AI-text detectors (research only, not an optimization target)", "watermark probes (no vendor keys)"]}
        (a.out / "research-tier.json").write_text(json.dumps(stub, indent=2))
        print("research tier is a stub; wrote research-tier.json")
        return 0
    load_gateway_key()
    slug = a.article.parent.name
    md = a.article.read_text()
    writer = infer_writer(a.article.parent / "version.json", a.writer)
    blockers: list[dict] = []
    lanes: dict[str, str] = {}

    shutil.copyfile(a.article, a.out / "draft-v1.md")
    author = load_author_corpus(a.author_corpus)
    pipe = load_pipeline_corpus(a.pipeline_corpus, exclude=slug)
    a_fps, p_fps = corpus_fps(author, core=False), corpus_fps(pipe, core=True)
    fw_mean, fw_std = M.fw_stats(a_fps + p_fps)
    orig_fp = M.fingerprint(core_markdown(md))
    ctx = {"author_centroid": M.centroid(a_fps), "orig_fp": orig_fp, "fw_mean": fw_mean, "fw_std": fw_std, "pipe_fps": p_fps}
    before = M.distance_to(ctx["author_centroid"], orig_fp, fw_mean, fw_std)

    # propositions, extracted once and shared by every rewriter
    segs = segment_article(md)
    ensure_extraction(segs, md, a.extractor, a.out / "extraction.json", a.refresh_extraction)
    lanes["extraction"] = f"{a.extractor}, {sum(len(s.propositions) for s in segs)} propositions in {sum(1 for s in segs if s.propositions)} segments"

    judge = resolve_model(a.judge)
    results, diffs = {}, {}
    plan = [(x, False) for x in a.rewriters.split(",") if x] + [(x, True) for x in a.control.split(",") if x]
    from concurrent.futures import ThreadPoolExecutor

    def job(item):
        spec, is_control = item
        try:
            return item, run_rewriter(spec, md, segs, writer, ctx, judge, a.out, control=is_control), None
        except (GatewayError, EvaluationError, ValueError) as e:
            return item, None, e

    with ThreadPoolExecutor(max_workers=len(plan) or 1) as ex:  # rewriters are independent; slow gateway model overlaps with CLI ones
        outcomes = list(ex.map(job, plan))
    for (spec, is_control), ok, err in outcomes:
        tag = f"rewrite:{spec}{' (control)' if is_control else ''}"
        if err:
            blockers.append({"what": f"{'control ' if is_control else ''}rewriter {spec}", "error": str(err)[:300],
                             "fix": "gateway models: expose it on GET /v1/models; CLI lanes: fix login/availability of claude -p / codex exec"})
            lanes[tag] = "blocked"
        else:
            res, rsegs = ok
            results[res["rewriter"]["model"]] = res
            diffs[res["rewriter"]["model"]] = top_diffs(rsegs)
            lanes[tag] = "ok"

    out = {
        "slug": slug, "writer": writer,
        "reference": {"author_docs": len(author), "author_words": sum(f["n_words"] for f in a_fps), "author_cutoff": "< 2023-01-01",
                      "pipeline_docs": len(pipe)},
        "original": {k: orig_fp[k] for k in ("n_words", "n_sentences", "n_paragraphs", "mean_sent_len", "em_dash_per_1k", "first_person_per_1k", "heading_per_1k", "list_items_per_1k", "one_sentence_para_rate", "repeated_ngram_rate")},
        "author_style_distance_before": before,
        "pipeline_corpus_outlier_before": M.outlier_score(p_fps, orig_fp, fw_mean, fw_std),
        "structural_templates_original": orig_fp["templates"],
        "author_centroid_summary": {k: ctx["author_centroid"][k] for k in ("mean_sent_len", "em_dash_per_1k", "first_person_per_1k", "one_sentence_para_rate")},
        "extractor": {"model": resolve_model(a.extractor).name, "family": resolve_model(a.extractor).family, "backend": resolve_model(a.extractor).backend,
                      "auth": "claude -p subscription, ANTHROPIC_API_KEY stripped from child env, apiKeySource=none verified" if a.extractor.startswith("claude") else "gateway key from env",
                      "note": "family guard applies to rewriters only; extractor may be any family"},
        "rewriters": results,
        "lanes": lanes,
        "watermark_tests": WATERMARK,
        "provenance": {"signal_family": "provenance", "status": "n/a for text"},
        "tier": "fast",
        "research_tier": {"run": False, "status": "stub; see docs"},
        "metric_groups": METRIC_GROUPS,
        "blockers": blockers,
    }
    (a.out / "metrics.json").write_text(json.dumps(out, indent=2))
    write_report(a.out / "report.md", out, diffs, blockers)
    print(f"wrote {a.out}/metrics.json report.md; rewriters ok={list(results)} blocked={[b['what'] for b in blockers]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
