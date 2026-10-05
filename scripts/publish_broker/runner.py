"""The broker's only path to the canonical evaluator: `python -m scripts.fingerprint_eval.release` run from the
broker-owned pinned checkout, with the broker's own record key and a per-snapshot workspace. Nothing the publishing
agent can write is on the import path of that subprocess: cwd is the pinned checkout, env is an allowlist."""
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

BASE_ENV = ("PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR")
AUTHORIZE_TIMEOUT_S = 1800
VERIFY_TIMEOUT_S = 120


@dataclass(frozen=True)
class VerifyResult:
    valid: bool
    reason: str
    content_sha256: str | None = None


class ReleaseRunner(Protocol):
    def head(self) -> tuple[str, bool]:
        """(pinned checkout HEAD sha, working tree clean)."""

    def authorize(self, workspace: Path, package: Path) -> tuple[int, str]:
        """Run `release authorize` on a snapshot. (exit code, tail of output)."""

    def verify(self, workspace: Path, package: Path) -> VerifyResult:
        """Run `release verify --json` against the evaluator as it is NOW."""


class SubprocessRunner:
    def __init__(self, pinned_checkout: Path, python_cmd: tuple[str, ...], eval_key_file: Path, pass_env: tuple[str, ...] = ()) -> None:
        self.pinned, self.python_cmd, self.key_file, self.pass_env = Path(pinned_checkout), tuple(python_cmd), Path(eval_key_file), tuple(pass_env)

    def _env(self, workspace: Path) -> dict[str, str]:
        env = {k: os.environ[k] for k in (*BASE_ENV, *self.pass_env) if k in os.environ}
        env["FINGERPRINT_EVAL_KEY_FILE"] = str(self.key_file)
        env["FINGERPRINT_EVAL_WORKSPACE"] = str(workspace)
        return env

    def _git(self, *args: str) -> str:
        p = subprocess.run(["git", "-C", str(self.pinned), *args], capture_output=True, text=True, timeout=30,
                           env={k: os.environ[k] for k in BASE_ENV if k in os.environ}, stdin=subprocess.DEVNULL)
        if p.returncode != 0:
            raise OSError(f"git {' '.join(args)}: {p.stderr.strip()[:200]}")
        return p.stdout

    def head(self) -> tuple[str, bool]:
        return self._git("rev-parse", "HEAD").strip(), self._git("status", "--porcelain", "--untracked-files=all").strip() == ""

    def _run(self, sub: list[str], workspace: Path, timeout: int) -> subprocess.CompletedProcess:
        cmd = [*self.python_cmd, "-m", "scripts.fingerprint_eval.release", *sub]
        return subprocess.run(cmd, cwd=str(self.pinned), capture_output=True, text=True, timeout=timeout, env=self._env(workspace),
                              stdin=subprocess.DEVNULL)

    def authorize(self, workspace: Path, package: Path) -> tuple[int, str]:
        try:
            p = self._run(["authorize", "--package", str(package)], workspace, AUTHORIZE_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            return 124, "release authorize timed out"
        except OSError as e:
            return 127, f"release authorize could not start: {e}"
        return p.returncode, (p.stdout + p.stderr)[-600:]

    def verify(self, workspace: Path, package: Path) -> VerifyResult:
        try:
            p = self._run(["verify", "--package", str(package), "--json"], workspace, VERIFY_TIMEOUT_S)
        except (subprocess.TimeoutExpired, OSError) as e:
            return VerifyResult(False, f"release verify failed to run: {e}")
        try:
            d = json.loads(p.stdout)
        except ValueError:
            return VerifyResult(False, (p.stderr or p.stdout or "verify printed no JSON").strip()[-300:])
        sha = d.get("content_sha256")
        valid = p.returncode == 0 and d.get("valid") is True and isinstance(sha, str)
        return VerifyResult(valid, str(d.get("reason", "")), sha if valid else None)
