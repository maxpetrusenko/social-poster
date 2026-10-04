"""Nightly watchdog: package inventory, release-integrity audit, circuit and dependency status.

Read-only over every package file. The only external effects are the allowlisted probes
(`GET {gateway}/v1/models`, `claude --version`, `codex --version`), skippable with probes=False.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import urllib.request
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from .contracts import (CIRCUITS_FILE, GATE_DIR, INFRA_CATEGORIES, QUARANTINE, RELEASE_ARTICLE, RELEASE_AUTH, RUNS_DIR,
                        Category)

OK, CRITICAL, LEGACY = "OK", "CRITICAL", "LEGACY_UNGATED"
EXIT_CRITICAL = 5
INFRA_VALUES = frozenset(c.value for c in INFRA_CATEGORIES)
QUEUE_FILE = "youtube-medium-playlist-queue.json"

# workflow.json mediumDraft.status values that mean scheduled or live. "not_created*", "not_started*" and
# "created_*" (draft only) are deliberately excluded.
_SCHEDULED_STATUS = re.compile(r"^(scheduled|published|posted|live|already_live)", re.I)
_SCHEDULE_KEYS = ("scheduledAt", "scheduledFor", "publishDate", "publishedAt", "postId")
_ACTION_TIME_KEYS = ("scheduledSetAt", "scheduledRecordedAt", "approvedAt", "updatedAt")
_TARGET_TIME_KEYS = ("scheduledAt", "scheduledFor", "publishDate", "publishedAt")


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read_json(p: Path):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return None


def _parse_date(v) -> date | None:
    if not isinstance(v, str) or not v:
        return None
    s = v.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def list_packages(workspace: Path) -> list[Path]:
    root = workspace / "articles"
    if not root.is_dir():
        return []
    return sorted(d for d in root.iterdir() if d.is_dir() and not d.name.startswith(("_", ".")))


def load_queue(workspace: Path) -> dict[str, dict]:
    q = read_json(workspace / QUEUE_FILE)
    out: dict[str, dict] = {}
    if isinstance(q, dict):
        for it in q.get("items") or []:
            if isinstance(it, dict) and it.get("articleSlug"):
                out[it["articleSlug"]] = it
    return out


@dataclass
class MediumState:
    scheduled_or_published: bool
    evidence: list[str] = field(default_factory=list)
    when: date | None = None          # best estimate of when the package was scheduled/published


def medium_state(pkg: Path, queue_item: dict | None = None) -> MediumState:
    """Detect scheduled/published from workflow.json mediumDraft and the playlist queue item. Evidence is recorded."""
    ev: list[str] = []
    wf = read_json(pkg / "workflow.json")
    md = wf.get("mediumDraft") if isinstance(wf, dict) else None
    md = md if isinstance(md, dict) else {}
    status = md.get("status")
    if isinstance(status, str) and _SCHEDULED_STATUS.match(status):
        ev.append(f"workflow.mediumDraft.status={status}")
    for k in _SCHEDULE_KEYS:
        if md.get(k):
            ev.append(f"workflow.mediumDraft.{k}")
    url = md.get("mediumUrl")
    if isinstance(url, str) and url and "/edit" not in url:
        ev.append("workflow.mediumDraft.mediumUrl(public)")
    qi = queue_item or {}
    if qi.get("status") == "posted":
        ev.append("queue.status=posted")
    if qi.get("mediumPublishedAt"):
        ev.append("queue.mediumPublishedAt")
    if isinstance(qi.get("mediumUrl"), str) and qi["mediumUrl"] and "/edit" not in qi["mediumUrl"]:
        ev.append("queue.mediumUrl(public)")
    if not ev:
        return MediumState(False)
    return MediumState(True, ev, _state_date(pkg, wf, md, qi))


def _state_date(pkg: Path, wf, md: dict, qi: dict) -> date | None:
    """Action-time fields first, then target-time fields, then file mtime. Never reads article prose."""
    ver = read_json(pkg / "version.json")
    cands = [md.get(k) for k in _ACTION_TIME_KEYS]
    cands.append(wf.get("updatedAt") if isinstance(wf, dict) else None)
    cands.append(ver.get("updatedAt") if isinstance(ver, dict) else None)
    cands += [md.get(k) for k in _TARGET_TIME_KEYS]
    cands.append(qi.get("mediumPublishedAt"))
    for c in cands:
        d = _parse_date(c)
        if d:
            return d
    try:
        return datetime.fromtimestamp((pkg / "workflow.json").stat().st_mtime, timezone.utc).date()
    except OSError:
        return None


def resolve_final(pkg: Path) -> Path | None:
    """Same precedence as the release resolver (version.json.finalFile > article-medium.md > articleFile), read-only."""
    ver = read_json(pkg / "version.json")
    ver = ver if isinstance(ver, dict) else {}
    for name in (ver.get("finalFile"), "article-medium.md", ver.get("articleFile")):
        if isinstance(name, str) and name and (pkg / name).is_file():
            return pkg / name
    vs = sorted(pkg.glob("article-v*.md"), key=lambda p: int(re.sub(r"\D", "", p.stem) or 0))
    return vs[-1] if vs else None


def run_records(pkg: Path) -> list[dict]:
    """Eval records, oldest first (filename starts with the UTC timestamp)."""
    out = []
    d = pkg / RUNS_DIR
    for f in sorted(d.glob("*.json")) if d.is_dir() else []:
        rec = read_json(f)
        if isinstance(rec, dict):
            rec["_path"] = str(f.relative_to(pkg))
            out.append(rec)
    return out


def _rec_hash(rec: dict) -> str | None:
    b = rec.get("binding")
    if isinstance(b, dict) and b.get("content_sha256"):
        return b["content_sha256"]
    return rec.get("content_sha256")


def _is_pass(rec: dict) -> bool:
    return str(rec.get("result", "")).upper() == "PASS"


def check_authorization(pkg: Path) -> tuple[bool, str]:
    """True iff authorization.json binds sha256(release/medium-final.md) AND a PASS record exists for that hash."""
    auth_p, rel_p = pkg / RELEASE_AUTH, pkg / RELEASE_ARTICLE
    if not auth_p.is_file():
        return False, "no release/authorization.json"
    if not rel_p.is_file():
        return False, "no release/medium-final.md"
    auth = read_json(auth_p)
    bound = ((auth or {}).get("binding") or {}).get("content_sha256") if isinstance(auth, dict) else None
    if not bound:
        return False, "authorization.json has no binding.content_sha256"
    actual = sha256_file(rel_p)
    if actual != bound:
        return False, f"release/medium-final.md sha256 {actual[:12]} != binding.content_sha256 {bound[:12]}"
    rp = auth.get("record_path")
    rec = None
    if isinstance(rp, str) and rp:
        p = Path(rp) if Path(rp).is_absolute() else pkg / rp
        rec = read_json(p) if p.is_file() else None
    if rec is not None:
        if _is_pass(rec) and _rec_hash(rec) == bound:
            return True, "ok"
        return False, "authorization record_path does not say PASS for the bound hash"
    if any(_is_pass(r) and _rec_hash(r) == bound for r in run_records(pkg)):
        return True, "ok"
    return False, "no PASS eval record for the bound hash"


def quarantine_info(pkg: Path) -> dict | None:
    q = read_json(pkg / QUARANTINE)
    if not isinstance(q, dict):
        return {"category": "UNREADABLE", "infra": False} if (pkg / QUARANTINE).exists() else None
    cat = q.get("category") or q.get("error_category") or "UNKNOWN"
    return {"category": cat, "status": q.get("status"), "infra": cat in INFRA_VALUES}


def inspect_package(pkg: Path, queue_item: dict | None, enforced_since: date) -> dict:
    recs = run_records(pkg)
    last = recs[-1] if recs else None
    authorized, why = check_authorization(pkg)
    ms = medium_state(pkg, queue_item)
    info = {
        "slug": pkg.name,
        "generated": resolve_final(pkg) is not None,
        "evaluated": bool(recs),
        "authorized": authorized,
        "pass_artifacts": len({_rec_hash(r) for r in recs if _is_pass(r)}),
        "last_result": str(last.get("result")) if last else None,
        "unresolved_error": bool(last) and str(last.get("result", "")).upper() == "ERROR",
        "quarantine": quarantine_info(pkg),
        "scheduled_or_published": ms.scheduled_or_published,
        "medium_evidence": ms.evidence,
        "medium_date": ms.when.isoformat() if ms.when else None,
        "integrity": None,
    }
    if ms.scheduled_or_published:
        if authorized:
            info["integrity"] = OK
        elif ms.when is not None and ms.when < enforced_since:
            info["integrity"] = LEGACY
            info["integrity_reason"] = why
        else:
            info["integrity"] = CRITICAL
            info["integrity_reason"] = why
    return info


def circuit_states(workspace: Path) -> dict:
    data = read_json(workspace / CIRCUITS_FILE)
    if not isinstance(data, dict):
        return {}
    data = data.get("circuits", data) if isinstance(data.get("circuits", data), dict) else data
    out = {}
    for dep, st in data.items():
        if isinstance(st, dict):
            out[dep] = {"state": "open" if st.get("opened_at") else "closed",
                        "consecutive_failures": st.get("consecutive_failures", 0),
                        "opened_at": st.get("opened_at"), "next_probe_at": st.get("next_probe_at")}
    return out


def _probe_cmd(cmd: list[str]) -> dict:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return {"ok": r.returncode == 0, "detail": (r.stdout or r.stderr).strip().splitlines()[:1]}
    except (OSError, subprocess.SubprocessError) as e:
        return {"ok": False, "detail": [type(e).__name__]}


def probe_dependencies(environ=None) -> dict:
    """Allowlisted probes only. The key is read from env and sent as a bearer header, never recorded."""
    env = os.environ if environ is None else environ
    base = env.get("LLM_GATEWAY_URL", "https://llm.maxpetrusenko.com/v1").rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    out = {}
    key = env.get("LLM_GATEWAY_API_KEY", "")
    if not key:
        out["gateway"] = {"ok": False, "detail": ["LLM_GATEWAY_API_KEY not set"]}
    else:
        try:
            req = urllib.request.Request(f"{base}/v1/models", headers={"Authorization": f"Bearer {key}"})
            with urllib.request.urlopen(req, timeout=15) as r:
                out["gateway"] = {"ok": 200 <= r.status < 300, "detail": [f"HTTP {r.status}"]}
        except Exception as e:  # noqa: BLE001 - probe result only
            out["gateway"] = {"ok": False, "detail": [type(e).__name__]}
    out["claude-cli"] = _probe_cmd(["claude", "--version"])
    out["codex-cli"] = _probe_cmd(["codex", "--version"])
    return out


def run_watchdog(workspace: Path, enforced_since: date, probes: bool = True) -> dict:
    queue = load_queue(workspace)
    pkgs = [inspect_package(p, queue.get(p.name), enforced_since) for p in list_packages(workspace)]
    crit = [p for p in pkgs if p["integrity"] == CRITICAL]
    legacy = [p for p in pkgs if p["integrity"] == LEGACY]
    qc = Counter(p["quarantine"]["category"] for p in pkgs if p["quarantine"])
    counts = {
        "packages": len(pkgs),
        "generated": sum(p["generated"] for p in pkgs),
        "evaluated": sum(p["evaluated"] for p in pkgs),
        "authorized": sum(p["authorized"] for p in pkgs),
        "scheduled_or_published": sum(p["scheduled_or_published"] for p in pkgs),
        "pass_artifacts": sum(p["pass_artifacts"] for p in pkgs),
        "quarantined": sum(qc.values()),
        "quarantined_by_category": dict(sorted(qc.items())),
        "unresolved_errors": sum(p["unresolved_error"] for p in pkgs),
    }
    return {
        "enforced_since": enforced_since.isoformat(),
        "counts": counts,
        "critical": [{k: p[k] for k in ("slug", "medium_evidence", "medium_date", "integrity_reason")} for p in crit],
        "legacy_ungated": [{k: p[k] for k in ("slug", "medium_evidence", "medium_date")} for p in legacy],
        "unresolved_error_slugs": [p["slug"] for p in pkgs if p["unresolved_error"]],
        "circuits": circuit_states(workspace),
        "dependencies": probe_dependencies() if probes else {"skipped": True},
        "packages": pkgs,
    }
