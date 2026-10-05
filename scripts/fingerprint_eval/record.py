"""EvalRecord and Authorization files: immutable write, schema-validated load, SUMMARY.md human block.

A record is the only proof of an evaluation. It is written once (hard link, never overwritten), read back through
`load_record`, which rejects anything that does not match the schema or contradicts itself.
"""
from __future__ import annotations

import dataclasses
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from .contracts import (GATE_DIR, RELEASE_AUTH, RUNS_DIR, SUMMARY, Authorization, Binding, Category, EvalRecord, HealCycle, Result)

SCHEMA_VERSION = 1
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class RecordError(ValueError):
    """A record or authorization file is missing, unreadable, or fails schema validation."""


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def jsonable(obj):
    """Dataclasses, enums and Paths to plain JSON types."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: jsonable(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, (Result, Category)):
        return obj.value
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, Path):
        return str(obj)
    return obj


def atomic_write(path: Path, data: bytes, *, exclusive: bool = False) -> None:
    """tmp + fsync + rename. exclusive: hard-link into place so an existing file is never replaced."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.tmp"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    try:
        if exclusive:
            os.link(tmp, path)
        else:
            os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


# ---- EvalRecord -----------------------------------------------------------------------------------------
def record_name(rec: EvalRecord) -> str:
    stamp = re.sub(r"[^0-9TZ]", "", rec.timestamp_utc)
    return f"{stamp}-{rec.binding.content_sha256[:12]}.json"


def to_dict(rec: EvalRecord) -> dict:
    return jsonable(rec)


def _need(d: dict, key: str, types: tuple, where: str = "record"):
    if key not in d:
        raise RecordError(f"{where}: missing field {key!r}")
    v = d[key]
    if isinstance(v, bool) and bool not in types:
        raise RecordError(f"{where}: field {key!r} has wrong type bool")
    if not isinstance(v, types):
        raise RecordError(f"{where}: field {key!r} has wrong type {type(v).__name__}")
    return v


def binding_from_dict(d, where: str = "binding") -> Binding:
    if not isinstance(d, dict):
        raise RecordError(f"{where}: not an object")
    vals = {k: _need(d, k, (str,), where) for k in ("content_sha256", "evaluator_id", "author_corpus_sha256")}
    if not SHA_RE.match(vals["content_sha256"]):
        raise RecordError(f"{where}: content_sha256 is not a sha256 hex digest")
    if not vals["evaluator_id"] or not vals["author_corpus_sha256"]:
        raise RecordError(f"{where}: empty evaluator_id or author_corpus_sha256")
    return Binding(**vals)


def from_dict(d) -> EvalRecord:
    if not isinstance(d, dict):
        raise RecordError("record: not an object")
    if d.get("schema_version") != SCHEMA_VERSION:
        raise RecordError(f"record: unsupported schema_version {d.get('schema_version')!r}")
    try:
        result, category = Result(d.get("result")), Category(d.get("category"))
    except ValueError as e:
        raise RecordError(f"record: {e}") from None
    if (result is Result.PASS) != (category is Category.PASS):
        raise RecordError(f"record: result {result.value} contradicts category {category.value}")
    ref_sha = d.get("reference_sha256")
    if ref_sha is not None and not (isinstance(ref_sha, str) and SHA_RE.match(ref_sha)):
        raise RecordError("record: reference_sha256 is not a sha256 hex digest")
    reasons = _need(d, "reasons", (list,))
    if not all(isinstance(r, str) for r in reasons):
        raise RecordError("record: reasons must be strings")
    structure = _need(d, "structure", (dict,))
    claims = _need(d, "claims", (dict,))
    if structure.get("evaluated") == "partial" and result is Result.PASS:
        raise RecordError("record: a partial evaluation (claims/semantic checks skipped) cannot be a PASS")
    if result is Result.PASS and claims.get("judged_by") == "identity" and not claims.get("reference_bound_by"):
        raise RecordError("record: identity judgement without reference_bound_by (reference is not the rated, hash-bound version)")
    rec = EvalRecord(
        schema_version=SCHEMA_VERSION, slug=_need(d, "slug", (str,)), binding=binding_from_dict(d.get("binding")),
        final_path=_need(d, "final_path", (str,)), final_rule=_need(d, "final_rule", (str,)),
        reference_path=d.get("reference_path") if isinstance(d.get("reference_path"), (str, type(None))) else _bad("reference_path"),
        reference_sha256=ref_sha, reference_identical=_need(d, "reference_identical", (bool,)),
        timestamp_utc=_need(d, "timestamp_utc", (str,)), evaluator_tree_sha256=_need(d, "evaluator_tree_sha256", (str,)),
        pipeline_corpus_sha256=_need(d, "pipeline_corpus_sha256", (str,)),
        models=_need(d, "models", (dict,)), claims=claims, links=_need(d, "links", (dict,)),
        structure=structure, semantic=_need(d, "semantic", (dict,)), advisory=_need(d, "advisory", (dict,)),
        result=result, category=category, reasons=reasons, runtime_s=float(_need(d, "runtime_s", (int, float))),
        raw_report_path=_need(d, "raw_report_path", (str,)), heal_cycle=int(_need(d, "heal_cycle", (int,))),
        parent_content_sha256=d.get("parent_content_sha256") if isinstance(d.get("parent_content_sha256"), (str, type(None))) else _bad("parent_content_sha256"),
        cache_hit=_need(d, "cache_hit", (bool,)))
    return rec


def _bad(name: str):
    raise RecordError(f"record: field {name!r} has wrong type")


def write_record(package: Path, rec: EvalRecord) -> Path:
    """Immutable: a record file is created once and never replaced."""
    path = package / RUNS_DIR / record_name(rec)
    from_dict(to_dict(rec))  # never persist something load_record would reject
    atomic_write(path, (json.dumps(to_dict(rec), indent=1, sort_keys=True) + "\n").encode(), exclusive=True)
    os.chmod(path, 0o444)
    return path


def load_record(path: Path) -> EvalRecord:
    try:
        return from_dict(json.loads(Path(path).read_text()))
    except (OSError, ValueError) as e:
        if isinstance(e, RecordError):
            raise
        raise RecordError(f"cannot read record {path}: {e}") from None


def list_records(package: Path) -> list[tuple[Path, EvalRecord]]:
    """Valid records, oldest first (file names sort by UTC timestamp). Invalid files are skipped, never trusted."""
    out = []
    for p in sorted((package / RUNS_DIR).glob("*.json")):
        try:
            out.append((p, load_record(p)))
        except RecordError:
            continue
    return out


def find_record_path(package: Path, rec: EvalRecord) -> Path | None:
    p = package / RUNS_DIR / record_name(rec)
    return p if p.is_file() else None


# ---- Authorization ----------------------------------------------------------------------------------------
def write_authorization(package: Path, auth: Authorization) -> Path:
    path = package / RELEASE_AUTH
    atomic_write(path, (json.dumps(jsonable(auth), indent=1, sort_keys=True) + "\n").encode())
    return path


def load_authorization(package: Path) -> Authorization:
    path = package / RELEASE_AUTH
    try:
        d = json.loads(path.read_text())
    except (OSError, ValueError) as e:
        raise RecordError(f"cannot read authorization {path}: {e}") from None
    if not isinstance(d, dict):
        raise RecordError("authorization: not an object")
    sha = _need(d, "release_article_sha256", (str,), "authorization")
    if not SHA_RE.match(sha):
        raise RecordError("authorization: release_article_sha256 is not a sha256 hex digest")
    return Authorization(binding=binding_from_dict(d.get("binding"), "authorization.binding"), record_path=_need(d, "record_path", (str,), "authorization"),
                         authorized_at_utc=_need(d, "authorized_at_utc", (str,), "authorization"), release_article_sha256=sha)


# ---- SUMMARY.md ---------------------------------------------------------------------------------------------
def _fmt(v, nd: int = 3) -> str:
    return f"{v:.{nd}f}" if isinstance(v, (int, float)) and not isinstance(v, bool) else "n/a"


def render_summary(rec: EvalRecord, cycles: list[HealCycle] | list[dict] | None = None, status: str | None = None) -> str:
    """status overrides the headline (e.g. NEEDS_REVIEW after quarantine); QUARANTINE.json itself carries no status field."""
    c, ln, sem, adv = rec.claims, rec.links, rec.semantic, rec.advisory
    if c.get("judged_by") == "identity":
        claims = "identical to reference (judged by identity)"
    else:
        claims = f"{c.get('preserved', 0)}/{c.get('total', 0)} preserved"
    lines = [f"Fingerprint / integrity gate: {status or rec.result.value}", f"Claims: {claims}",
             f"Links: {ln.get('preserved', 0)}/{ln.get('expected', 0)} preserved",
             f"Semantic retention: {_fmt(sem.get('whole'))}",
             f"Author distance: {_fmt(adv.get('author_distance'))} [report only]",
             f"Pipeline repetition z-score: {_fmt(adv.get('pipeline_outlier_z'), 2)} [report only]",
             f"Evaluator: {rec.binding.evaluator_id}", f"Evaluated content: {rec.binding.content_sha256}", f"Evaluated at: {rec.timestamp_utc}"]
    if rec.result is not Result.PASS or status:
        lines.append(f"Category: {rec.category.value}")
        lines.append("Reasons:")
        lines += [f"  - {r}" for r in rec.reasons] or ["  - none recorded"]
    if cycles:
        lines.append("Heal cycles:")
        for cy in cycles:
            d = jsonable(cy)
            lines.append(f"  {d['index']}. {d['category']} ({d['kind']}) {d['repair']} -> {str(d['output_sha256'])[:12]} {d['result']} {d['elapsed_s']:.1f}s")
    return "\n".join(lines) + "\n"


def write_summary(package: Path, rec: EvalRecord, cycles=None, status: str | None = None) -> Path:
    path = package / SUMMARY
    atomic_write(path, render_summary(rec, cycles, status).encode())
    return path


__all__ = ["RecordError", "SCHEMA_VERSION", "GATE_DIR"]
