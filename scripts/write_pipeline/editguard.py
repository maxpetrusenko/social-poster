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
from scripts.fingerprint_eval.gateway import child_env, claude_env

from . import mdlib as M

Runner = Callable[[list[str]], tuple[int, str]]
REPO = Path(__file__).resolve().parents[2]
CONTENT_CATS = {"CONTENT_CLAIM_FAILURE", "ADDED_UNSUPPORTED_CLAIM", "MISSING_LINK", "STRUCTURAL_DAMAGE", "MISSING_SOURCE"}
CLAIM_CATS = {"CONTENT_CLAIM_FAILURE", "ADDED_UNSUPPORTED_CLAIM"}


# Non-secret configuration only for every child. The Doppler tokens and every other API key are never passed, and claude -p
# children get subscription auth through claude_env(). Only the evaluator/gate children (fingerprint_eval run and release) also
# receive LLM_GATEWAY_API_KEY: non-identity claims gates call the gateway judge and would block without it.
RUNNER_CONFIG_KEYS = ("LLM_GATEWAY_URL", "SSL_CERT_FILE", "FINGERPRINT_EVAL_KEY_FILE", "FG_JUDGE", "FG_EXTRACTOR")
GATE_ENV_KEYS = ("LLM_GATEWAY_API_KEY", "LLM_GATEWAY_URL")
GATE_MODULES = ("scripts.fingerprint_eval.run", "scripts.fingerprint_eval.release")


def is_gate_child(argv: list[str] | None) -> bool:
    return bool(argv) and len(argv) > 2 and argv[1] == "-m" and argv[2] in GATE_MODULES


def runner_env(environ=None, argv: list[str] | None = None) -> dict[str, str]:
    env = {**claude_env(environ), **child_env(RUNNER_CONFIG_KEYS, environ)}
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
               author_material: bool = False) -> dict:
    """Returns {"ok", "reasons", "categories"}. strict=True is used after the reference is frozen: no removals, structure and
    frozen blocks must be identical to the reference. strict=False (editorial and voice) allows only declared removals."""
    reasons: list[str] = []
    cats: list[str] = []
    gone_text = "\n".join(str(r.get("text", "")) for r in (removals or []))
    gone_urls = Counter(M.link_urls(gone_text))
    gone_nums = M.significant_numbers(gone_text)

    lost_links = Counter(M.link_urls(ref)) - Counter(M.link_urls(cand)) - gone_urls
    if lost_links:
        reasons.append(f"link removed: {sorted(lost_links)[:3]}")
        cats.append("MISSING_LINK")
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
        fd = frozen_diff(ref, cand)
        if fd:
            reasons.append("frozen block (list, quote, code, short paragraph) changed:\n" + "\n".join(fd[:6]))
            cats.append("CONTENT_CLAIM_FAILURE" if any(l.startswith(("-", "+")) and not l.startswith(("---", "+++")) for l in fd) else "STRUCTURAL_DAMAGE")
        cand_s = {M.norm(x) for x in M.sentences(cand)}
        for s in M.sentences(ref):
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
    return {"ok": not reasons, "reasons": reasons, "categories": sorted(set(cats))}


def gate_argv(article: Path, draft: Path, out: Path, package: Path) -> list[str]:
    return [sys.executable, "-m", "scripts.fingerprint_eval.run", "--gate", "--article", str(article), "--draft", str(draft),
            "--author-corpus", str(REPO / AUTHOR_CORPUS_DIR), "--pipeline-corpus", str(package.parent), "--out", str(out)]


def claims_gate(runner: Runner, article: Path, draft: Path, out: Path, package: Path) -> dict:
    """The existing evaluator gate on (draft -> article). state: PASS | FAIL | ERROR. ERROR never means PASS."""
    out.mkdir(parents=True, exist_ok=True)
    (out / "gate.json").unlink(missing_ok=True)
    rc, text = runner(gate_argv(article, draft, out, package))
    try:
        g = json.loads((out / "gate.json").read_text())
    except (OSError, ValueError):
        g = {}
    cats = list(g.get("failure_categories") or [])
    if g.get("error_category"):
        cats.append(g["error_category"])
    if rc == 0 and g.get("pass") is True:
        return {"state": "PASS", "categories": [], "reasons": [], "rc": rc, "evaluated": g.get("evaluated")}
    state = "FAIL" if rc == 1 and g.get("evaluated") else "ERROR"
    return {"state": state, "categories": cats, "reasons": list(g.get("reasons") or [text.strip()[-200:]])[:5], "rc": rc, "evaluated": g.get("evaluated")}
