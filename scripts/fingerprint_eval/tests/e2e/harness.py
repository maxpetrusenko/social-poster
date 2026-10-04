"""Shared helpers: package copies, in-process release CLI driver, ledger/record readers, readiness guard."""
from __future__ import annotations

import contextlib
import hashlib
import importlib
import importlib.util
import io
import json
import os
import runpy
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
FIXTURE = Path(__file__).parent / "fixtures" / "package"
REQUIRED_MODULES = ("release", "authz", "heal", "repair", "circuit")
WORKSPACE_CIRCUITS = REPO / "data" / "article-workspace" / "fingerprint-eval" / "circuits.json"


def missing_modules() -> list[str]:
    out = []
    for m in REQUIRED_MODULES:
        try:
            if importlib.util.find_spec(f"scripts.fingerprint_eval.{m}") is None:
                out.append(m)
        except (ImportError, ValueError):
            out.append(m)
    return out


def sha(data: bytes | str) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def make_package(root: Path, name: str = "pkg") -> Path:
    dest = root / name
    shutil.copytree(FIXTURE, dest)
    return dest


def final_file(pkg: Path) -> Path:
    """Mirror of the documented resolver: version.json.finalFile > article-medium.md > version.json.articleFile."""
    v = json.loads((pkg / "version.json").read_text())
    if v.get("finalFile"):
        return pkg / v["finalFile"]
    if (pkg / "article-medium.md").exists():
        return pkg / "article-medium.md"
    return pkg / v["articleFile"]


@dataclass
class CliResult:
    code: int
    out: str


def run_cli(*args: str) -> CliResult:
    """`python -m scripts.fingerprint_eval.release <args>` in-process (so the fakes apply). Honors both a
    main(argv) function and a plain `if __name__ == "__main__"` module."""
    buf = io.StringIO()
    code = 0
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        try:
            mod = importlib.import_module("scripts.fingerprint_eval.release")
            if hasattr(mod, "main"):
                rc = mod.main(list(args))
                code = int(rc or 0)
            else:
                old = sys.argv
                sys.argv = ["release", *args]
                try:
                    runpy.run_module("scripts.fingerprint_eval.release", run_name="__main__", alter_sys=True)
                finally:
                    sys.argv = old
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    return CliResult(code, buf.getvalue())


def authorize(pkg: Path, *extra: str) -> CliResult:
    return run_cli("authorize", "--package", str(pkg), *extra)


def verify(pkg: Path) -> CliResult:
    return run_cli("verify", "--package", str(pkg))


def status(pkg: Path) -> CliResult:
    return run_cli("status", "--package", str(pkg), "--json")


# ---- readers ---------------------------------------------------------------------------------------
def ledger(pkg: Path) -> list[dict]:
    p = pkg / "evals/fingerprint-gate/ledger.jsonl"
    return [json.loads(line) for line in p.read_text().splitlines() if line.strip()] if p.exists() else []


def states(pkg: Path) -> list[str]:
    return [str(e["state"]).split(".")[-1] for e in ledger(pkg)]


def cycles(pkg: Path) -> list[dict]:
    """HealCycle details recorded in the ledger (HEAL_CYCLE events)."""
    return [e.get("detail", {}) for e in ledger(pkg) if str(e["state"]).endswith("HEAL_CYCLE")]


def cat_name(v) -> str:
    return str(v).split(".")[-1]


def kinds(pkg: Path) -> set[str]:
    return {c.get("kind") for c in cycles(pkg)}


def categories(pkg: Path) -> list[str]:
    return [cat_name(c.get("category")) for c in cycles(pkg)]


def runs(pkg: Path) -> list[Path]:
    d = pkg / "evals/fingerprint-gate/runs"
    return sorted(d.glob("*.json")) if d.is_dir() else []


def auth(pkg: Path) -> dict:
    return json.loads((pkg / "release/authorization.json").read_text())


def auth_hash(pkg: Path) -> str:
    return auth(pkg)["binding"]["content_sha256"]


def release_files(pkg: Path) -> list[Path]:
    return [p for p in (pkg / "release/medium-final.md", pkg / "release/authorization.json") if p.exists()]


def circuits_snapshot() -> bytes | None:
    return WORKSPACE_CIRCUITS.read_bytes() if WORKSPACE_CIRCUITS.exists() else None


def reset_circuits(saved: bytes | None) -> None:
    WORKSPACE_CIRCUITS.parent.mkdir(parents=True, exist_ok=True)
    if saved is None:
        WORKSPACE_CIRCUITS.unlink(missing_ok=True)
    else:
        WORKSPACE_CIRCUITS.write_bytes(saved)
