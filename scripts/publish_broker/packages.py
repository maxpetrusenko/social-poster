"""Package resolution and snapshotting. The workspace is writable by the publishing agent, so it is untrusted input:
the broker copies a package into its own store before evaluating it and publishes only from that copy. Any change
the agent makes to the workspace after the snapshot cannot alter what was authorized or what gets pasted."""
from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path

from .schema import SLUG_RE, BrokerError

RELEASE_FINAL = Path("release/medium-final.md")
RELEASE_AUTH = Path("release/authorization.json")


def resolve_package(workspace_root: Path, slug: str) -> Path:
    if not SLUG_RE.match(slug) or ".." in slug:
        raise BrokerError("bad_package_ref", "package must be a slug")
    articles = Path(workspace_root) / "articles"
    pkg = articles / slug
    try:
        st = os.lstat(pkg)
    except OSError:
        raise BrokerError("package_not_found", f"no package {slug!r} in the workspace") from None
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
        raise BrokerError("bad_package_ref", "package must be a real directory, not a symlink")
    if articles.resolve() != Path(os.path.realpath(pkg)).parent:
        raise BrokerError("bad_package_ref", "package escapes the workspace")
    return pkg


def snapshot(src: Path, dest_pkg: Path, *, max_bytes: int, max_files: int) -> None:
    """Copy src into dest_pkg. Refuses symlinks, special files, and oversized trees (checked before copying)."""
    total = count = 0
    src = Path(src)

    def skip(dirpath: str, names: list[str]) -> set[str]:
        """Gate output is never imported from the agent's tree: the broker's evaluator regenerates all of it."""
        rel = Path(dirpath).relative_to(src)
        if rel == Path("."):
            return {n for n in names if n in ("release", "QUARANTINE.json")}
        if rel == Path("evals"):
            return {n for n in names if n == "fingerprint-gate"}
        return set()

    for dirpath, dirnames, filenames in os.walk(src, followlinks=False):
        dirnames[:] = [d for d in dirnames if d not in skip(dirpath, dirnames)]
        filenames[:] = [f for f in filenames if f not in skip(dirpath, filenames)]
        for name in [*dirnames, *filenames]:
            st = os.lstat(os.path.join(dirpath, name))
            if stat.S_ISLNK(st.st_mode):
                raise BrokerError("package_has_symlink", f"{os.path.join(dirpath, name)} is a symlink; refusing to snapshot")
            if stat.S_ISREG(st.st_mode):
                total, count = total + st.st_size, count + 1
            elif not stat.S_ISDIR(st.st_mode):
                raise BrokerError("package_has_special_file", f"{name} is not a regular file or directory")
        if total > max_bytes or count > max_files:
            raise BrokerError("package_too_large", f"package exceeds {max_bytes} bytes or {max_files} files")
    dest_pkg.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copytree(src, dest_pkg, symlinks=False, ignore=skip)
    for p in [dest_pkg, *dest_pkg.rglob("*")]:
        p.chmod(0o700 if p.is_dir() else 0o600)
