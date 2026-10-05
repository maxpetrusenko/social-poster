"""Test helper: lay down a throwaway installed-guard directory (key + manifest) for the real guard file."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path

import medium_publish_guard as g


def install_fake_guard(root: Path, guard_file: Path | None = None) -> dict[str, str]:
    """Create <root>/guards with key (0400) and manifest for `guard_file` (default: the repo guard)."""
    gd = root / "guards"
    gd.mkdir(parents=True, exist_ok=True)
    key = gd / "key"
    if key.exists():
        os.chmod(key, 0o600)
    key.write_text("ab" * 32)
    os.chmod(key, 0o400)
    src = guard_file or Path(g.__file__).resolve()
    (gd / "manifest.sha256").write_text(f"{hashlib.sha256(src.read_bytes()).hexdigest()}  medium_publish_guard.py\n")
    rk = root / "record.key"
    if not rk.exists():
        rk.write_text("ef" * 32)
        os.chmod(rk, 0o600)
    return {"MEDIUM_GUARD_TEST_MODE": "1", "MEDIUM_GUARD_DIR": str(gd), "MEDIUM_GUARD_STATE_DIR": str(gd / "state"),
            "MEDIUM_GUARD_RECORD_KEY": str(rk)}


def write_active(ws: Path, key_file: Path, pkg: Path, sha: str, slug: str | None = None, **over) -> Path:
    """Write <ws>/release/ACTIVE.json exactly as release.write_active does (record.py HMAC over canonical json)."""
    doc = {"package": str(pkg.resolve()), "slug": slug or pkg.name, "content_sha256": sha, "activated_at_utc": "2026-01-01T00:00:00Z"}
    doc.update(over)
    body = {k: v for k, v in doc.items() if k != "hmac_sha256"}
    canon = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    doc["hmac_sha256"] = hmac.new(key_file.read_bytes().strip(), canon, hashlib.sha256).hexdigest()
    path = ws / "release" / "ACTIVE.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc))
    return path
