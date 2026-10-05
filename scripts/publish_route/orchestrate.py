"""Gather the two checks, call decide(), and (optionally) run the bounded AUTO_REPAIR loop.

Neither check is reimplemented. Check 1 is `scripts.fingerprint_eval.release verify|authorize`, Check 2 is
`scripts.medium_review review|autofix`, both called as subprocesses with an allowlisted env (gateway.child_env).
Every content change reruns `release authorize`, then the review on the new bytes. At most MAX_ROUTE_CYCLES repair cycles.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from scripts.fingerprint_eval.gateway import CLAUDE_ENV_KEYS, child_env
from scripts.medium_review import checks as CK
from scripts.medium_review.package import resolve
from scripts.medium_review.scorecard import evaluator_id, validate_review

from . import publications as PUB
from . import repair as RP
from .decide import ROUTES, decide

REPO = Path(__file__).resolve().parents[2]
MAX_ROUTE_CYCLES = 2
# Per-child allowlists. Only the integrity gate (embeddings via the gateway) receives the gateway key; the Medium review
# child (claude -p only) gets subscription auth and no gateway/API secrets.
REVIEW_ENV_KEYS = CLAUDE_ENV_KEYS + ("SSL_CERT_FILE",)
RELEASE_ENV_KEYS = CLAUDE_ENV_KEYS + ("LLM_GATEWAY_API_KEY", "LLM_GATEWAY_URL", "SSL_CERT_FILE", "FINGERPRINT_EVAL_KEY_FILE", "FG_JUDGE", "FG_EXTRACTOR")
ROUTE_ENV_KEYS = RELEASE_ENV_KEYS  # back-compat alias
ROUTE_REL = Path("evals") / "publish-route" / "route.json"
REVIEW_REL = Path("evals") / "medium-distribution" / "MEDIUM_REVIEW.json"
Runner = Callable[[list[str]], tuple[int, str]]


def default_runner(argv: list[str]) -> tuple[int, str]:
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=1800, cwd=REPO, env=child_env(REVIEW_ENV_KEYS if "scripts.medium_review" in argv else RELEASE_ENV_KEYS))
    except (OSError, subprocess.SubprocessError) as e:
        return 127, f"{type(e).__name__}: {e}"
    return p.returncode, p.stdout + (("\n" + p.stderr) if p.returncode else "")


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _read_json(p: Path) -> dict:
    try:
        d = json.loads(p.read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _cmd(module: str, *args: str) -> list[str]:
    return [sys.executable, "-m", module, *args]


def _review_cmd(sub: str, package: Path, article: Path | None) -> list[str]:
    return _cmd("scripts.medium_review", sub, "--package", str(package), *(["--article", str(article)] if article else []), "--json")


def integrity_record_id(package: Path) -> str | None:
    rp = _read_json(package / "release" / "authorization.json").get("record_path")
    return Path(rp).stem if isinstance(rp, str) and rp else None


def gather_check1(package: Path, cur_sha: str, runner: Runner) -> dict:
    rc, out = runner(_cmd("scripts.fingerprint_eval.release", "verify", "--package", str(package), "--json"))
    try:
        v = json.loads(out.strip().splitlines()[-1]) if out.strip() else {}
    except ValueError:
        v = {}
    if rc == 0 and v.get("valid") is True and v.get("content_sha256") == cur_sha:
        return {"state": "PASS", "integrity_record_id": integrity_record_id(package), "reason": "release verify: VERIFIED"}
    q = _read_json(package / "QUARANTINE.json")
    if q and q.get("content_sha256") == cur_sha:
        state = "QUARANTINED_RETRYABLE" if q.get("retryable") else "QUARANTINED"
        return {"state": state, "integrity_record_id": None, "reason": f"{q.get('category')} ({q.get('kind')})"}
    return {"state": "NEEDS_AUTHORIZE", "integrity_record_id": None, "reason": str(v.get("reason") or out.strip()[-200:] or "not authorized")}


def gather_review(package: Path, cur_sha: str) -> dict | None:
    """Strictly validated (schema, evaluator, policy, dimensions, content hash); anything else is None, so the route fails closed to C."""
    rec = _read_json(package / REVIEW_REL)
    return rec if validate_review(rec, cur_sha, evaluator_id()) is None else None


def _titles(*srcs: dict) -> tuple[list, list]:
    tc, sc = [], []
    for s in srcs:
        for k in ("titleCandidates", "title_candidates"):
            for c in s.get(k) or []:
                tc.append({"title": c} if isinstance(c, str) else c)
        for k in ("subtitleCandidates", "subtitle_candidates"):
            sc += [c for c in s.get(k) or [] if isinstance(c, str)]
    return tc, sc


def gather_meta(ctx, text: str, queue_item: dict | None) -> dict:
    prov = CK.load_provenance(ctx.package, ctx.version)
    srcs = [m.group(2) for _, ln in CK.prose_lines(text) for m in CK.IMG_LINE.finditer(ln)]
    with_prov = sum(1 for s in srcs if (p := prov.get(Path(s.split("?")[0]).name)) and CK.credit_text(p))
    title, sub = CK.title_and_subtitle(text)
    tc, sc = _titles(ctx.version, ctx.workflow)
    qi = dict(queue_item or {})
    for src in (ctx.version, ctx.workflow):
        for k in ("queueItem", "queue_item"):
            if isinstance(src.get(k), dict):
                qi = {**src[k], **qi}
        qi.setdefault("channel", src.get("channel") if isinstance(src.get("channel"), str) else None)
        qi.setdefault("source_name", src.get("sourceName") or src.get("source_name"))
    qi = {"channel": qi.get("channel") or qi.get("channelName"), "source_name": qi.get("source_name") or qi.get("sourceName")}
    topics = sorted({str(t).strip() for v in CK.parse_tags(ctx.version, ctx.workflow).values() for t in (v or []) if str(t).strip()}, key=str.lower)
    return {"images": len(srcs), "images_with_provenance": with_prov, "title": title, "subtitle": sub, "title_candidates": tc,
            "subtitle_candidates": sc, "queue_item": qi, "topics": topics}


def snapshot(package: Path, article: Path | None, runner: Runner, queue_item, pubs) -> dict:
    ctx = resolve(package, article)
    raw = ctx.article_path.read_bytes()
    sha = _sha(raw)
    review = gather_review(ctx.package, sha)
    check1 = gather_check1(ctx.package, sha, runner)
    meta = gather_meta(ctx, raw.decode("utf-8"), queue_item)
    return {"ctx": ctx, "sha": sha, "review": review, "check1": check1, "meta": meta, "decision": decide(check1, review, meta, pubs["valid"])}


def _apply_cycle(ctx, article: Path | None, d: dict, runner: Runner) -> tuple[Path | None, dict]:
    """One repair cycle. Returns (article to use next, log). Content change -> authorize -> review, in that order."""
    log: dict = {"actions": d["actions"], "repairs": [r["kind"] for r in d["repairs"]], "steps": []}
    changed, newp = False, None
    if "repair" in d["actions"]:
        if any(r.get("source") == "medium_review.autofix" for r in d["repairs"]):
            rc, out = runner(_review_cmd("autofix", ctx.package, article))
            log["steps"].append({"autofix": rc})
            try:
                fixes = json.loads(out[out.index("{"):]).get("fixes", []) if rc == 0 else []
            except ValueError:
                fixes = []
            md = [f for f in fixes if f.get("kind") != "tags" and str(f.get("path", "")).endswith(".md")]
            if md:
                newp, changed = Path(md[-1]["path"]), True
        own = [r for r in d["repairs"] if r.get("source") != "medium_review.autofix"]
        if own:
            text, applied = RP.apply_own((newp or ctx.article_path).read_text(), own)
            log["steps"].append({"own_repairs": applied})
            if applied:
                newp, changed = RP.write_new_version(ctx.package, text), True
        if changed and newp is not None:
            RP.rebind_final(ctx.package, newp)
            article = None
    log["content_changed"] = changed
    rc, out = runner(_cmd("scripts.fingerprint_eval.release", "authorize", "--package", str(ctx.package)))
    log["steps"].append({"authorize": rc})
    log["authorize_rc"] = rc
    if rc != 2:  # 2 = package unresolvable: nothing to review
        rc2, _ = runner(_review_cmd("review", ctx.package, article))
        log["steps"].append({"review": rc2})
    return article, log


def route_record(snap: dict, d: dict, history: list, pubs: dict) -> dict:
    review, ctx = snap["review"], snap["ctx"]
    rec = {"schema_version": 1, "route": d["route"], "route_code": d["route_code"], "detail": d["detail"], "reasons": d["reasons"],
           "repairs": d["repairs"], "publication_candidates": d["publication_candidates"], "topics": d["topics"],
           "boost_recommendation": (review or {}).get("scorecard", {}).get("boost_candidate"),
           "article": str(ctx.article_path.relative_to(ctx.package)) if ctx.article_path.is_relative_to(ctx.package) else str(ctx.article_path),
           "binding": {"content_sha256": snap["sha"], "integrity_record_id": snap["check1"].get("integrity_record_id"),
                       "medium_review_policy_version": (review or {}).get("binding", {}).get("policy_version"),
                       "medium_review_content_sha256": (review or {}).get("binding", {}).get("content_sha256")},
           "check1": {"state": snap["check1"]["state"], "reason": snap["check1"].get("reason")},
           "check2": {"status": "REVIEWED" if review else "MISSING_OR_STALE"},
           "publications_version": pubs.get("version"), "publications_rejected": pubs.get("rejected", []),
           "repair_cycles": history, "decided_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    rec["route_sha256"] = _sha(_canon(rec))
    return rec


def _canon(rec: dict) -> bytes:
    return json.dumps({k: v for k, v in rec.items() if k != "route_sha256"}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def write_route(package: Path, rec: dict) -> Path:
    p = package / ROUTE_REL
    p.parent.mkdir(parents=True, exist_ok=True)
    RP._atomic_write(p, (json.dumps(rec, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode())
    return p


def verify_route(package: Path, article: Path | None = None) -> tuple[bool, str]:
    """route.json is valid only for the exact bytes, integrity record and review policy version it was decided on."""
    package = Path(package).resolve()
    rec = _read_json(package / ROUTE_REL)
    if not rec:
        return False, "route.json missing or unreadable"
    if rec.get("route_sha256") != _sha(_canon(rec)):
        return False, "route.json was modified (self hash mismatch)"
    try:
        ctx = resolve(package, article)
    except FileNotFoundError as e:
        return False, f"cannot resolve article: {e}"
    b = rec.get("binding", {})
    if _sha(ctx.article_path.read_bytes()) != b.get("content_sha256"):
        return False, "article bytes changed since the route was decided"
    if integrity_record_id(package) != b.get("integrity_record_id"):
        return False, "integrity record changed since the route was decided"
    pv = _read_json(package / REVIEW_REL).get("binding", {}).get("policy_version")
    if pv != b.get("medium_review_policy_version"):
        return False, "MEDIUM_REVIEW policy version changed since the route was decided"
    return True, "route.json matches the current bytes, integrity record and review policy version"


def run_route(package: Path, article: Path | None = None, *, runner: Runner = default_runner, repair: bool = False,
              max_cycles: int = MAX_ROUTE_CYCLES, queue_item: dict | None = None, publications_path: Path = PUB.DEFAULT_PATH,
              write: bool = True) -> dict:
    """Decide the route; with repair=True run the bounded AUTO_REPAIR loop. Returns the route record (also written)."""
    package = Path(package).resolve()
    max_cycles = max(0, min(int(max_cycles), MAX_ROUTE_CYCLES))
    pubs = PUB.load(publications_path)
    history: list = []
    snap = snapshot(package, article, runner, queue_item, pubs)
    d = snap["decision"]
    while d["route_code"] == "C" and repair:
        if len(history) >= max_cycles:
            d = {**d, "route": ROUTES["D"], "route_code": "D", "detail": "D_REPAIR_EXHAUSTED",
                 "reasons": [f"auto-repair still pending after {max_cycles} cycles"] + d["reasons"], "repairs": [], "actions": []}
            break
        article, log = _apply_cycle(snap["ctx"], article, d, runner)
        history.append(log)
        if log["authorize_rc"] == 2:
            d = {**d, "route": ROUTES["D"], "route_code": "D", "detail": "D_UNRESOLVABLE_PACKAGE",
                 "reasons": ["release authorize cannot resolve this package; repairs cannot proceed"] + d["reasons"], "repairs": [], "actions": []}
            break
        snap = snapshot(package, article, runner, queue_item, pubs)
        d = snap["decision"]
    rec = route_record(snap, d, history, pubs)
    if write:
        write_route(package, rec)
    return rec
