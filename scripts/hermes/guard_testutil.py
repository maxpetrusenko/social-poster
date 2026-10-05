"""Test helper: lay down a throwaway installed-guard directory (key + manifest) for the real guard file."""
from __future__ import annotations

import hashlib
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
    return {"MEDIUM_GUARD_TEST_MODE": "1", "MEDIUM_GUARD_DIR": str(gd), "MEDIUM_GUARD_STATE_DIR": str(gd / "state")}
