"""Package resolution, versions/hashes, and the canonical GateFn (`evaluate_package`).

Reference rule (checked against real packages in medium-automation/articles): the rated version is the file named by
the latest `evals/prepublish-vN.json` (`articleFile`; if that file also carries a sha256 field it must match the file's
bytes, else the rating no longer applies and there is no reference). Without a prepublish eval, `version.json.articleFile`
(the version carrying the rating). Missing or unreadable -> None -> MISSING_SOURCE.
"""
from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from . import ledger, record as R
from .contracts import (AUTHOR_CORPUS_DIR, AUTHOR_CORPUS_MANIFEST, GATE_DIR, Binding, Category, EvalRecord, EvaluatorVersion, LedgerState, PackageCtx, Result)

REPO = Path(__file__).resolve().parents[2]
TREE_DIR = Path("scripts/fingerprint_eval")
EXCLUDED_DIRS = ("tests", "calibration")
THRESHOLD = 0.90
MODELS = {"judge": os.environ.get("FG_JUDGE", "claude:sonnet"), "extractor": os.environ.get("FG_EXTRACTOR", "claude:sonnet")}
EMBED_MODEL = "nomic-embed-text:latest"


class PackageError(ValueError):
    """The package cannot be resolved (no final file, malformed version.json, path escapes the package)."""


class EnvError(RuntimeError):
    """Evaluator version or corpus cannot be established (git/manifest problems)."""


def set_models(judge: str | None = None, extractor: str | None = None) -> None:
    """Hook for approved fallbacks (e.g. claude:sonnet -> qwen3:8b); the heal layer picks from APPROVED_FALLBACKS."""
    if judge:
        MODELS["judge"] = judge
    if extractor:
        MODELS["extractor"] = extractor


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    return _sha(p.read_bytes())


# ---- resolution -----------------------------------------------------------------------------------------------
def _inside(package: Path, rel: str, what: str) -> Path:
    p = (package / rel).resolve()
    if not p.is_relative_to(package.resolve()):
        raise PackageError(f"{what} {rel!r} escapes the package")
    if not p.is_file():
        raise PackageError(f"{what} {rel!r} does not exist")
    return p


def _version_json(package: Path) -> dict:
    vj = package / "version.json"
    if not vj.exists():
        return {}
    try:
        d = json.loads(vj.read_text())
    except (OSError, ValueError) as e:
        raise PackageError(f"version.json unreadable: {e}") from None
    if not isinstance(d, dict):
        raise PackageError("version.json is not an object")
    return d


def _reference(package: Path, vj: dict) -> Path | None:
    evals = sorted((p for p in (package / "evals").glob("prepublish-v*.json") if re.fullmatch(r"prepublish-v\d+\.json", p.name)),
                   key=lambda p: int(re.sub(r"\D", "", p.name)))
    rel = None
    if evals:
        try:
            d = json.loads(evals[-1].read_text())
            rel = d.get("articleFile") if isinstance(d, dict) else None
            bound = next((d[k] for k in ("articleSha256", "contentSha256", "sha256") if isinstance(d.get(k), str)), None) if isinstance(d, dict) else None
        except (OSError, ValueError):
            return None
        if isinstance(rel, str) and bound:
            try:
                if _inside(package, rel, "reference").read_bytes() and sha256_file(_inside(package, rel, "reference")) != bound:
                    return None  # the rating is bound to bytes that no longer exist
            except PackageError:
                return None
    rel = rel if isinstance(rel, str) else vj.get("articleFile")
    if not isinstance(rel, str):
        return None
    try:
        return _inside(package, rel, "reference")
    except PackageError:
        return None


def resolve_package(package: Path | str) -> PackageCtx:
    package = Path(package)
    if not package.is_dir():
        raise PackageError(f"package directory not found: {package}")
    vj = _version_json(package)
    if vj.get("finalFile"):
        final, rule = _inside(package, str(vj["finalFile"]), "finalFile"), "version.json.finalFile"
    elif (package / "article-medium.md").is_file():
        final, rule = (package / "article-medium.md").resolve(), "article-medium.md"
    elif vj.get("articleFile"):
        final, rule = _inside(package, str(vj["articleFile"]), "articleFile"), "version.json.articleFile"
    else:
        raise PackageError("no final candidate: no version.json.finalFile, article-medium.md or version.json.articleFile")
    notes = package / "sources" / "source-notes.md"
    return PackageCtx(package=package, slug=str(vj.get("slug") or package.name), final_path=final, final_rule=rule,
                      reference_path=_reference(package, vj), source_notes=notes if notes.is_file() else None)


# ---- versions and hashes ---------------------------------------------------------------------------------------
def _git(*args: str) -> str:
    try:
        p = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as e:
        raise EnvError(f"git unavailable: {e}") from None
    if p.returncode != 0:
        raise EnvError(f"git {' '.join(args)} failed: {p.stderr.strip()[:200]}")
    return p.stdout


def evaluator_version() -> EvaluatorVersion:
    sha = _git("rev-parse", "HEAD").strip()
    h = hashlib.sha256()
    tree = REPO / TREE_DIR
    for p in sorted(tree.rglob("*.py")):
        if "__pycache__" in p.parts or any(x in p.relative_to(tree).parts[:1] for x in EXCLUDED_DIRS):
            continue
        h.update(p.relative_to(REPO).as_posix().encode() + b"\0" + p.read_bytes() + b"\0")
    excl = [f":(exclude){(TREE_DIR / d).as_posix()}" for d in EXCLUDED_DIRS]  # only runtime .py files count
    dirty = bool(_git("status", "--porcelain", "--untracked-files=all", "--", TREE_DIR.as_posix(), *excl).strip())
    return EvaluatorVersion(git_sha=sha, tree_sha256=h.hexdigest(), dirty=dirty)


def corpus_sha256() -> str:
    """sha256 of the canonical MANIFEST, with the file list rebuilt from the bytes actually on disk: any edit, addition or
    removal of a corpus file changes the hash even if MANIFEST.json itself was left alone."""
    d = REPO / AUTHOR_CORPUS_DIR
    try:
        man = json.loads((REPO / AUTHOR_CORPUS_MANIFEST).read_text())
    except (OSError, ValueError) as e:
        raise EnvError(f"author corpus MANIFEST unreadable: {e}") from None
    files = sorted(({"name": p.name, "sha256": sha256_file(p)} for p in d.glob("*.txt")), key=lambda f: f["name"])
    if not files:
        raise EnvError("author corpus is empty")
    man["files"] = files
    return _sha(json.dumps(man, sort_keys=True, separators=(",", ":")).encode())


def pipeline_corpus_sha256(articles_dir: Path) -> str:
    """Advisory: latest article-vN.md of the 30 most recent packages."""
    try:
        pkgs = sorted((d for d in articles_dir.iterdir() if d.is_dir() and not d.name.startswith("_blocked")), key=lambda d: d.stat().st_mtime)[-30:]
        h = hashlib.sha256()
        for d in sorted(pkgs):
            vs = sorted(d.glob("article-v*.md"), key=lambda p: int(re.sub(r"\D", "", p.stem) or 0))
            if vs:
                h.update(d.name.encode() + b"\0" + vs[-1].read_bytes() + b"\0")
        return h.hexdigest()
    except OSError:
        return "unavailable"


def current_binding(ctx: PackageCtx, candidate: Path) -> Binding:
    return Binding(content_sha256=sha256_file(candidate), evaluator_id=evaluator_version().id, author_corpus_sha256=corpus_sha256())


# ---- the gate ----------------------------------------------------------------------------------------------------
def _model_info(spec: str) -> dict:
    from .gateway import resolve_model
    m = resolve_model(spec)
    return {"name": m.name, "family": getattr(m, "family", None), "backend": m.backend, "version": m.model_id}


def _cached(package: Path, binding: Binding, ref_sha: str | None) -> tuple[Path, EvalRecord] | None:
    for p, rec in reversed(R.list_records(package)):
        if rec.binding == binding and rec.reference_sha256 == ref_sha and rec.result in (Result.PASS, Result.FAIL) and not rec.cache_hit:
            return p, rec
    return None


def _build_record(ctx: PackageCtx, binding: Binding, tree_sha: str, ref_sha: str | None, gate: dict, ts: str, runtime: float, raw: str) -> EvalRecord:
    result = Result(gate.get("result") or Result.ERROR.value)
    inputs = gate.get("inputs") or {}
    blk = gate.get("blocking") or {}
    cl = blk.get("claims") or {}
    st = blk.get("structure") or {}
    adv = gate.get("advisory") or {}
    aa, ss = adv.get("author_anchor") or {}, adv.get("stylistic_structural") or {}
    if result is Result.PASS:
        cat = Category.PASS
    elif result is Result.FAIL:
        fc = gate.get("failure_categories") or []
        cat = Category(fc[0]) if fc else Category.CONTENT_CLAIM_FAILURE
    else:
        try:
            cat = Category(gate.get("error_category") or Category.UNKNOWN_ERROR.value)
        except ValueError:
            cat = Category.UNKNOWN_ERROR
        if cat in (Category.PASS,):
            cat = Category.UNKNOWN_ERROR
    miss = (st.get("links") or {}).get("missing", [])
    link_exp = (st.get("links") or {}).get("original", 0)

    def part(key: str) -> dict:
        s = st.get(key) or {}
        return {"expected": s.get("original", 0), "preserved": max(s.get("original", 0) - len(s.get("missing", [])), 0), "diffs": s.get("missing", [])}

    frozen_reasons = [r for r in gate.get("reasons", []) if r.startswith("frozen blocks")]
    structure = {"images": part("images"), "headings": part("headings"), "code": part("codes"),
                 "frozen": {"expected": None, "preserved": bool(blk.get("frozen_blocks_identical", result is Result.PASS)), "diffs": frozen_reasons},
                 "failure_categories": gate.get("failure_categories", [])}
    models = {"extractor": _model_info(MODELS["extractor"]), "judge": _model_info(MODELS["judge"]),
              "embedding": {"name": EMBED_MODEL, "family": "nomic", "backend": "gateway", "version": EMBED_MODEL}}
    advisory = {"author_distance": aa.get("after"), "sentence_jsd": ss.get("sentence_length_jsd_draft_vs_final"),
                "paragraph_jsd": ss.get("paragraph_length_jsd_draft_vs_final"), "repeated_ngram_rate": ss.get("repeated_ngram_rate"),
                "rule_of_three": None, "templates": ss.get("structural_templates"), "pipeline_outlier_z": ss.get("pipeline_outlier"),
                "advisory_errors": [adv["advisory_error"]] if adv.get("advisory_error") else [], "sections_below_threshold": adv.get("sections_below_threshold", {})}
    return EvalRecord(
        schema_version=R.SCHEMA_VERSION, slug=ctx.slug, binding=binding, final_path=str(ctx.final_path), final_rule=ctx.final_rule,
        reference_path=str(ctx.reference_path) if ctx.reference_path else None, reference_sha256=ref_sha,
        reference_identical=bool(gate.get("reference_identical", inputs.get("reference_identical", False))), timestamp_utc=ts,
        evaluator_tree_sha256=tree_sha, pipeline_corpus_sha256=pipeline_corpus_sha256(ctx.package.parent), models=models,
        claims={"total": cl.get("total", 0), "preserved": cl.get("claims_entailed", 0), "changed": cl.get("claims_changed", 0),
                "missing": cl.get("claims_missing", 0), "added_unsupported": cl.get("added_unsupported", 0),
                "judged_by": "identity" if cl.get("judge") == "identity" else cl.get("judge")},
        links={"expected": link_exp, "preserved": max(link_exp - len(miss), 0), "missing": miss}, structure=structure,
        semantic={"whole": blk.get("semantic_similarity_whole"), "section_min": blk.get("semantic_section_min"), "threshold": gate.get("threshold", THRESHOLD)},
        advisory=advisory, result=result, category=cat, reasons=[str(r) for r in gate.get("reasons", [])], runtime_s=runtime, raw_report_path=raw)


def _error_gate(category: Category, msg: str, result: Result = Result.ERROR) -> dict:
    g: dict = {"result": result.value, "reasons": [msg[:400]], "failure_categories": [], "reference_identical": False}
    if result is Result.ERROR:
        g["error_category"] = category.value
    else:
        g["failure_categories"] = [category.value]
    return g


def evaluate_package(ctx: PackageCtx, candidate: Path) -> EvalRecord:
    """GateFn. Never raises. Writes an immutable record and ledger events; a hit in the Binding-keyed cache makes no model call."""
    from . import gate as G
    t0 = time.monotonic()
    candidate = Path(candidate)
    pkg = ctx.package
    zero = "0" * 64
    try:
        content = sha256_file(candidate)
    except OSError as e:
        content, early = zero, _error_gate(Category.UNKNOWN_ERROR, f"cannot read candidate {candidate}: {e}")
    else:
        early = None
    try:
        ev = evaluator_version()
        binding = Binding(content, ev.id, corpus_sha256())
        tree_sha = ev.tree_sha256
    except Exception as e:  # noqa: BLE001
        binding, tree_sha = Binding(content, "unknown", "unknown"), "unknown"
        early = early or _error_gate(Category.DEPENDENCY_FAILURE, f"cannot establish evaluator/corpus identity: {e}")
    ledger_ok = True
    try:
        ledger.append(pkg, LedgerState.GATE_REQUESTED, content, binding.evaluator_id, {"candidate": str(candidate), "requester": "authz.evaluate_package"})
    except OSError:
        ledger_ok = False
    ref_sha = None
    ref = ctx.reference_path
    if ref is not None:
        try:
            ref_sha = sha256_file(ref)
        except OSError:
            ref = None
    cache_hit_path = None
    rec: EvalRecord | None = None
    if early is None and ref is None:
        early = _error_gate(Category.MISSING_SOURCE, "reference version missing or unreadable: cannot ground the comparison", Result.FAIL)
    if early is None:
        hit = _cached(pkg, binding, ref_sha)
        if hit:
            cache_hit_path, rec = hit[0], dataclasses.replace(hit[1], cache_hit=True)
    if rec is None:
        ts = R.now_utc()
        raw_rel = ""
        if early is not None:
            gate = early
        else:
            gate, raw_rel = _run_gate(ctx, candidate, ref, ts, content)
        rec = _build_record(ctx, binding, tree_sha, ref_sha, gate, ts, round(time.monotonic() - t0, 3), raw_rel)
        try:
            path = R.write_record(pkg, rec)
        except (OSError, R.RecordError) as e:
            rec = dataclasses.replace(rec, result=Result.ERROR, category=Category.UNKNOWN_ERROR, reasons=[f"cannot persist record: {e}"[:400]])
            path = None
    else:
        path = cache_hit_path
    if ledger_ok and path is not None:
        try:
            rel = str(path.relative_to(pkg))
            ledger.append(pkg, LedgerState.GATE_EXECUTED, content, binding.evaluator_id, {"record": rel, "cache_hit": rec.cache_hit, "result": rec.result.value})
            ledger.append(pkg, LedgerState.RESULT_VALID, content, binding.evaluator_id, {"record": rel, "result": rec.result.value})
            if rec.binding == binding and binding.evaluator_id != "unknown":
                ledger.append(pkg, LedgerState.RESULT_MATCHES_CONTENT, content, binding.evaluator_id, {"record": rel})
        except OSError:
            pass
    return rec


def _run_gate(ctx: PackageCtx, candidate: Path, ref: Path, ts: str, content: str) -> tuple[dict, str]:
    from . import gate as G
    from . import run as run_mod
    work = ctx.package / GATE_DIR / "work"
    try:
        work.mkdir(parents=True, exist_ok=True)
        draft = ref
        if ref.resolve() == candidate.resolve():  # final IS the rated file: compare it to a byte copy of itself
            draft = work / "reference-copy.md"
            shutil.copyfile(ref, draft)
        run_mod.load_gateway_key()
        G.run_gate(candidate, draft, None, ctx.package.parent, work, MODELS["judge"], THRESHOLD, MODELS["extractor"], False, identity_shortcut=True, source_notes=ctx.source_notes)
        gate = json.loads((work / "gate.json").read_text())
    except Exception as e:  # noqa: BLE001  fail closed
        return _error_gate(Category.UNKNOWN_ERROR, f"gate did not produce a verdict: {type(e).__name__}: {e}"), ""
    raw_rel = ""
    try:
        raw = ctx.package / GATE_DIR / "raw" / (re.sub(r"[^0-9TZ]", "", ts) + f"-{content[:12]}.gate.json")
        R.atomic_write(raw, json.dumps(gate, indent=1).encode(), exclusive=True)
        raw_rel = str(raw.relative_to(ctx.package))
    except OSError:
        pass
    return gate, raw_rel
