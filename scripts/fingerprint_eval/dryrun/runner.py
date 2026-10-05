"""Run the release CLI for one case workspace.

Offline: in-process under the e2e FakeModels (the fakes patch module attributes, so they cannot cross a process boundary).
Real: a subprocess of the same CLI, so claude -p (subscription) and the LLM gateway behave exactly as in production.
Either way the env carries FINGERPRINT_EVAL_WORKSPACE (the case sandbox) and FINGERPRINT_EVAL_KEY_FILE (a throwaway key).
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[3]


@dataclass
class Res:
    code: int
    out: str

    def json(self) -> dict:
        try:
            return json.loads(self.out[self.out.index("{"):])
        except ValueError:
            return {}


class Runner:
    def __init__(self, workspace: Path, key_file: Path, offline: bool):
        self.workspace, self.key_file, self.offline = workspace, key_file, offline

    def base_env(self) -> dict[str, str]:
        return {"FINGERPRINT_EVAL_WORKSPACE": str(self.workspace), "FINGERPRINT_EVAL_KEY_FILE": str(self.key_file)}

    @contextlib.contextmanager
    def env(self, extra: dict | None = None):
        with mock.patch.dict(os.environ, {**self.base_env(), **(extra or {})}):
            yield

    def release(self, *args: str, env: dict | None = None, faults: list | None = None) -> Res:
        """`faults` (offline only): e2e Fault objects. `env`: extra environment for this call."""
        if not self.offline:
            p = subprocess.run([sys.executable, "-m", "scripts.fingerprint_eval.release", *args], cwd=str(REPO), capture_output=True,
                               text=True, env={**os.environ, **self.base_env(), **(env or {})}, timeout=3600)
            return Res(p.returncode, p.stdout + p.stderr)
        from scripts.fingerprint_eval import release
        from scripts.fingerprint_eval.tests.e2e.fakes import FakeModels
        buf, code = io.StringIO(), 0
        with self.env(env), FakeModels(faults=faults or []), contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                code = int(release.main(list(args)) or 0)
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        return Res(code, buf.getvalue())

    def authorize(self, pkg: Path, **kw) -> Res:
        return self.release("authorize", "--package", str(pkg), **kw)

    def verify(self, pkg: Path) -> Res:
        return self.release("verify", "--package", str(pkg), "--json")

    def status(self, pkg: Path) -> Res:
        return self.release("status", "--package", str(pkg), "--json")
