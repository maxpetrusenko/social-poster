"""Independent recomputation of the final verification. Nothing here trusts state.json or a stage record's claims: every fact is
re-derived from the bytes on disk and the signed evaluator records. Any mismatch is a failure, so the caller reports NOT_READY."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from scripts.fingerprint_eval.contracts import RELEASE_ARTICLE, Result
from scripts.publish_route.orchestrate import ROUTE_REL, _canon, _sha

from . import frame as FR
from . import mdlib as M
from .core import FINAL_NAME, READY_ROUTES, Pipeline, PipelineError, safe_path, sha_bytes

PACKAGE_FILES = (FINAL_NAME, "FINAL.html", "PACKAGE.md")


def record_check(pkg: Path, final_sha: str) -> None:
    """The signed release authorization and gate record (record-key HMAC) must say PASS for exactly these final bytes. Raises on any problem."""
    from scripts.fingerprint_eval import record as R
    auth = R.load_authorization(pkg)
    rec = R.load_record_in(pkg, auth.record_path)
    R.check_raw_report(pkg, rec)
    if rec.result is not Result.PASS:
        raise R.RecordError(f"gate record is {rec.result.value}, not PASS")
    if rec.binding.content_sha256 != final_sha or auth.release_article_sha256 != final_sha:
        raise R.RecordError("gate record is bound to different bytes than FINAL.md")
    if sha_bytes((pkg / RELEASE_ARTICLE).read_bytes()) != final_sha:
        raise R.RecordError("release article differs from FINAL.md")


def route_artifact(pkg: Path, final_sha: str) -> tuple[dict, str | None]:
    """route.json strict validation: parses, self hash holds, bound to the final bytes. Returns (record, failure)."""
    try:
        rec = json.loads(safe_path(pkg, ROUTE_REL).read_text())
    except (OSError, ValueError, PipelineError):
        return {}, "route artifact missing or unreadable"
    if not isinstance(rec, dict) or rec.get("route_sha256") != _sha(_canon(rec)):
        return {}, "route artifact self hash mismatch (modified)"
    b = rec.get("binding")
    if not isinstance(b, dict) or b.get("content_sha256") != final_sha:
        return rec, "route artifact is not bound to the final bytes"
    return rec, None


def final_failures(pipe: Pipeline, runner, before_stop: bool = False) -> list[str]:
    pkg, bad = pipe.pkg, []
    try:
        raw = safe_path(pkg, FINAL_NAME).read_bytes()
    except (OSError, PipelineError):
        return ["FINAL.md is missing or unreadable"]
    sha = sha_bytes(raw)
    if (pipe.state.get("final") or {}).get("sha256") != sha:
        bad.append("FINAL.md hash differs from the recorded final hash")
    if (pipe.rec("integrity") or {}).get("final_sha256") != sha or pipe.read_json("hash").get("final_sha256") != sha:
        bad.append("FINAL.md hash differs from the integrity or hash stage record")
    for st in ("integrity", "hash", "package") + (() if before_stop else ("stop",)):
        if pipe.status(st) != "DONE":
            bad.append(f"stage {st} is {pipe.status(st)}, not DONE")
    # the signed gate record, checked directly with the record key
    try:
        record_check(pkg, sha)
    except Exception as e:  # noqa: BLE001  RecordError, OSError, ValueError: all mean not verified
        bad.append(f"signed gate record check failed: {str(e)[:200]}")
    rc, out = runner([sys.executable, "-m", "scripts.fingerprint_eval.release", "verify", "--package", str(pkg), "--json"])
    try:
        v = json.loads(out.strip().splitlines()[-1])
    except (ValueError, IndexError):
        v = {}
    if rc != 0 or v.get("valid") is not True or v.get("content_sha256") != sha:
        bad.append(f"release verify does not confirm the final bytes (rc={rc})")
    # the route artifact, strictly, for this hash
    route, why = route_artifact(pkg, sha)
    pk = pipe.read_json("package")
    if why:
        bad.append(why)
    elif route.get("route_code") not in READY_ROUTES or route.get("route_code") != pk.get("route_code"):
        bad.append(f"route artifact code {route.get('route_code')!r} is not the approved route recorded by the package stage")
    rrc, _ = runner([sys.executable, "-m", "scripts.publish_route", "verify", "--package", str(pkg), "--article", str(safe_path(pkg, FINAL_NAME))])
    if rrc != 0:
        bad.append(f"publish_route verify rejects route.json (rc={rrc})")
    # package outputs: hashed from disk now, compared with the package record, FINAL.html re-rendered from the final bytes
    files = pk.get("files") if isinstance(pk.get("files"), dict) else {}
    for n in PACKAGE_FILES:
        try:
            cur = sha_bytes(safe_path(pkg, n).read_bytes())
        except (OSError, PipelineError):
            bad.append(f"package output {n} is missing")
            continue
        if files.get(n) != cur:
            bad.append(f"package output {n} differs from the hash recorded when it was built")
    if files.get(FINAL_NAME) != sha:
        bad.append("package record is bound to different final bytes")
    try:
        text = raw.decode("utf-8")
        title, _, _ = M.title_subtitle(text)
        if safe_path(pkg, "FINAL.html").read_text() != FR.to_html(text, title or pipe.state["slug"]):
            bad.append("FINAL.html is not the rendering of FINAL.md")
    except (OSError, PipelineError, UnicodeDecodeError):
        bad.append("FINAL.html could not be re-rendered for comparison")
    return bad


real_record_check = record_check


def make_verifier(runner):
    return lambda pipe, before_stop=False: final_failures(pipe, runner, before_stop)
