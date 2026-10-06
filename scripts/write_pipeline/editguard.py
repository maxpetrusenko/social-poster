"""Deterministic guards on a text edit, plus the adapter to the existing claims gate (fingerprint_eval --gate).

edit_guard is the cheap, model-free half: it never lets an edit lose or invent a link or a number, break structure, or
add personal experience. claims_gate is the evaluator half and is called through an injectable runner.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Callable

from scripts.fingerprint_eval.contracts import AUTHOR_CORPUS_DIR
from scripts.fingerprint_eval.guards import frozen_diff, structure_preservation
from scripts.fingerprint_eval.gateway import child_env, claude_env, plain_env
from scripts.fingerprint_eval.textutil import resolve_pipeline_corpus

from . import cuts as CT
from . import furniture as FU
from . import linkpolicy as LP
from . import mdlib as M

Runner = Callable[[list[str]], tuple[int, str]]
REPO = Path(__file__).resolve().parents[2]
CONTENT_CATS = {"CONTENT_CLAIM_FAILURE", "ADDED_UNSUPPORTED_CLAIM", "MISSING_LINK", "STRUCTURAL_DAMAGE", "MISSING_SOURCE"}
CLAIM_CATS = {"CONTENT_CLAIM_FAILURE", "ADDED_UNSUPPORTED_CLAIM"}


# Credential policy for the generic runner (every module child it launches):
#   * CLAUDE_CODE_OAUTH_TOKEN only reaches a child that itself runs `claude -p` (CLAUDE_MODULES), through gateway.claude_env().
#   * LLM_GATEWAY_API_KEY only reaches the fingerprint_eval gate/release children (GATE_MODULES), whose judge calls the gateway.
#   * Every other child (publish_route, anything unknown) gets a non-secret env: runtime basics plus RUNNER_CONFIG_KEYS.
# The Doppler tokens and every other API key are never passed to anything.
RUNNER_CONFIG_KEYS = ("FINGERPRINT_PIPELINE_CORPUS", "FG_MAX_PARALLEL", "LLM_GATEWAY_URL", "SSL_CERT_FILE", "FINGERPRINT_EVAL_KEY_FILE", "FG_JUDGE", "FG_EXTRACTOR")
GATE_ENV_KEYS = ("LLM_GATEWAY_API_KEY", "LLM_GATEWAY_URL")
GATE_MODULES = ("scripts.fingerprint_eval.run", "scripts.fingerprint_eval.release", "scripts.write_pipeline.gaterun")
CLAUDE_MODULES = (*GATE_MODULES, "scripts.medium_review")


def _module(argv: list[str] | None) -> str | None:
    return argv[2] if argv and len(argv) > 2 and argv[1] == "-m" else None


def is_gate_child(argv: list[str] | None) -> bool:
    return _module(argv) in GATE_MODULES


def is_claude_child(argv: list[str] | None) -> bool:
    return _module(argv) in CLAUDE_MODULES


def runner_env(environ=None, argv: list[str] | None = None) -> dict[str, str]:
    env = {**(claude_env(environ) if is_claude_child(argv) else plain_env(environ)), **child_env(RUNNER_CONFIG_KEYS, environ)}
    if is_gate_child(argv):
        env.update(child_env(GATE_ENV_KEYS, environ))
    return env


def make_runner(workspace: Path) -> Runner:
    """Subprocess runner with the evaluator's allowlisted env. FINGERPRINT_EVAL_WORKSPACE points at a pipeline-private directory so a
    release authorize here writes its ACTIVE selector there and never replaces the production selector another article may hold."""
    def run(argv: list[str]) -> tuple[int, str]:
        env = runner_env(argv=argv)
        env["FINGERPRINT_EVAL_WORKSPACE"] = str(workspace)
        try:
            p = subprocess.run(argv, capture_output=True, text=True, timeout=1800, cwd=REPO, env=env)
        except (OSError, subprocess.SubprocessError) as e:
            return 127, f"{type(e).__name__}: {e}"
        return p.returncode, p.stdout + (("\n" + p.stderr) if p.returncode else "")
    return run


def has_author_material(sources: dict) -> bool:
    return any(s.get("kind") == "author" and s.get("status") == "captured" for s in (sources.get("sources") or []))


def edit_guard(ref: str, cand: str, *, known_urls: set[str], blob_numbers: Counter, strict: bool, removals: list[dict] | None = None,
               author_material: bool = False, ev: dict | None = None) -> dict:
    """Returns {"ok", "reasons", "categories"}. strict=True is used after the reference is frozen: no removals, structure and
    frozen blocks must be identical to the reference. strict=False (editorial and voice) allows only declared removals."""
    reasons: list[str] = []
    cats: list[str] = []
    gone_text = "\n".join(str(r.get("text", "")) for r in (removals or []))
    gone_nums = M.significant_numbers(gone_text)

    lp = LP.check_links(ref, cand, removals, ev)  # URL identity, declared removals, ledger dependents, one source link left (linkpolicy.py)
    reasons += lp["reasons"]
    cats += lp["categories"]
    new_links = {u for u in M.link_urls(cand) if u not in set(M.link_urls(ref)) and u not in known_urls}
    if new_links:
        reasons.append(f"link not backed by the source or evidence set: {sorted(new_links)[:3]}")
        cats.append("MISSING_SOURCE")

    nr, nc = M.significant_numbers(ref), M.significant_numbers(cand)
    lost_n = nr - nc - gone_nums
    if lost_n:
        reasons.append(f"number lost or changed: {sorted(lost_n)[:5]}")
        cats.append("CONTENT_CLAIM_FAILURE")
    new_n = {k: v for k, v in (nc - nr).items() if k not in blob_numbers}
    if new_n:
        reasons.append(f"number not found in the sources or evidence: {sorted(new_n)[:5]}")
        cats.append("ADDED_UNSUPPORTED_CLAIM")

    if strict:
        st = structure_preservation(ref, cand)
        for k in ("headings", "codes", "images"):
            if not st[k]["preserved"]:
                reasons.append(f"{k} changed: missing={st[k]['missing'][:2]}")
                cats.append("STRUCTURAL_DAMAGE")
        ff = FU.footer_changed(ref, cand)  # the footer (Read next, bio, sharing line, disclosure) is frozen boilerplate: any edit fails
        if ff:
            reasons.append(ff)
            cats.append("STRUCTURAL_DAMAGE")
        fr = FU.furniture_edit_reasons(ref, cand, ev)  # TLDR and hero caption may change, within limits; the claims gate judges the TLDR
        if fr:
            reasons += fr
            cats.append("CONTENT_CLAIM_FAILURE")
        fd = frozen_diff(ref, cand)
        if fd:
            reasons.append("frozen block (list, quote, code, short paragraph) changed:\n" + "\n".join(fd[:6]))
            cats.append("CONTENT_CLAIM_FAILURE" if any(l.startswith(("-", "+")) and not l.startswith(("---", "+++")) for l in fd) else "STRUCTURAL_DAMAGE")
        cand_s = {M.norm(x) for x in M.sentences(cand)}
        declared = {CT._key(str(r.get("text", ""))) for r in (removals or []) if isinstance(r, dict)}
        for s in M.sentences(ref):
            if CT._key(s) in declared:  # a declared cut is checked by the caller (cuts.apply_cuts) and by the claims gate
                continue
            if (M.significant_numbers(s) or M.link_urls(s)) and M.norm(s) not in cand_s:
                # a factual sentence may be reworded only if every number and link it carried is still in the same paragraph
                par = next((b.text for b in M.blocks(cand) if b.kind == "paragraph" and all(k in M.significant_numbers(b.text) for k in M.significant_numbers(s))
                            and all(u in M.link_urls(b.text) for u in M.link_urls(s))), None)
                if par is None:
                    reasons.append(f"factual sentence removed or split from its numbers or links: {s[:100]!r}")
                    cats.append("CONTENT_CLAIM_FAILURE")

    before = set(M.lint_v6(ref))
    for p in M.lint_v6(cand):
        if p not in before:
            reasons.append(p)
            cats.append("STRUCTURAL_DAMAGE")
    if not author_material and M.EXPERIENCE.search(M.strip_code(cand)) and not M.EXPERIENCE.search(M.strip_code(ref)):
        reasons.append("first-person experience claim with no author-supplied material: record an AUTHOR OPPORTUNITY instead")
        cats.append("ADDED_UNSUPPORTED_CLAIM")
    return {"ok": not reasons, "reasons": reasons, "categories": sorted(set(cats)), "removed_urls": lp["removed_urls"], "removed_sentences": lp["removed_sentences"]}


def gate_argv(article: Path, draft: Path, out: Path, package: Path, environ=None, notes: Path | None = None) -> list[str]:
    """The pipeline corpus is configured (env FINGERPRINT_PIPELINE_CORPUS or <repo>/.cache/fingerprint-eval/pipeline), never the
    package's parent: that can be a whole Desktop and scanning it timed the gate out. No corpus: the flag is omitted and the gate
    skips its advisory pipeline comparison (advisory_errors "pipeline corpus unavailable")."""
    mod = "scripts.write_pipeline.gaterun" if notes is not None else "scripts.fingerprint_eval.run"  # same gate; gaterun also binds the source notes
    argv = [sys.executable, "-m", mod, "--gate", "--article", str(article), "--draft", str(draft),
            "--author-corpus", str(REPO / AUTHOR_CORPUS_DIR), "--out", str(out)]
    if notes is not None:
        argv += ["--source-notes", str(notes)]
    corpus = resolve_pipeline_corpus(environ, REPO)
    return argv + ["--pipeline-corpus", str(corpus)] if corpus else argv


def claims_gate(runner: Runner, article: Path, draft: Path, out: Path, package: Path, notes: Path | None = None) -> dict:
    """The existing evaluator gate on (draft -> article). state: PASS | FAIL | ERROR. ERROR never means PASS.
    notes: source notes + evidence ledger; with them the gate's added-claim support check can see what supports a new sentence."""
    out.mkdir(parents=True, exist_ok=True)
    (out / "gate.json").unlink(missing_ok=True)
    rc, text = runner(gate_argv(article, draft, out, package, notes=notes))
    try:
        g = json.loads((out / "gate.json").read_text())
    except (OSError, ValueError):
        g = {}
    cats = list(g.get("failure_categories") or [])
    if g.get("error_category"):
        cats.append(g["error_category"])
    if rc == 0 and g.get("pass") is True:
        return {"state": "PASS", "categories": [], "reasons": [], "rc": rc, "evaluated": g.get("evaluated"), "added_unsupported": []}
    state = "FAIL" if rc == 1 and g.get("evaluated") else "ERROR"
    return {"state": state, "categories": cats, "reasons": list(g.get("reasons") or [text.strip()[-200:]])[:5], "rc": rc, "evaluated": g.get("evaluated"),
            "added_unsupported": list((g.get("blocking") or {}).get("added_unsupported_claims") or [])}


def confirm_link_removals(guard: dict, runner: Runner, pkg: Path, cand: str, work: Path) -> tuple[list[str], bool]:
    """Policy rule (b), run by a stage after edit_guard passed with declared link removals: the claims gate must find the removed
    sentences' claims gone, not paraphrased elsewhere. (reasons, blocked): blocked = the gate could not evaluate (retry, never a pass)."""
    if not guard.get("removed_urls"):
        return [], False
    r = LP.removed_claims_gone(runner, pkg, cand, guard["removed_sentences"], claims_gate, work)
    if r["state"] == "ok":
        return [], False
    if r["state"] == "error":
        return ["claims gate could not check the removed claims (retry later): " + "; ".join(r["reasons"])[:200]], True
    return [f"link removal rejected: {r['reasons'][0]}"], False
