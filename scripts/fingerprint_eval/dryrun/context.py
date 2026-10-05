"""Per-case context: sandbox workspace, package copies, release runner, guard rig and the evidence collected on the way."""
from __future__ import annotations

import json
from pathlib import Path

from . import sandbox as S
from .guardrig import GuardRig, NAV, PASTE
from .runner import Runner

GATE = "evals/fingerprint-gate"


class Ctx:
    def __init__(self, name: str, source: Path, sandbox_root: Path, offline: bool, guard_file: Path | None, log: Path):
        self.name, self.source, self.offline = name, source, offline
        self.ws = sandbox_root / name
        self.rig_root = sandbox_root / "_rig" / name
        self.ws.mkdir(parents=True)
        key = self.rig_root / "home/.config/fingerprint-eval/record.key"
        self.runner = Runner(self.ws, key, offline)
        self.rig = GuardRig(self.rig_root, self.ws, key, guard_file, log)
        vj = json.loads((source / "version.json").read_text()) if (source / "version.json").exists() else {}
        self.slug = vj.get("slug") or source.name
        self.ev: dict = {"exit_codes": {}, "hashes": {}, "notes": {}}

    # -- packages --------------------------------------------------------------------------------------------------
    def package(self, name: str | None = None) -> Path:
        """Fresh copy of the source package at <case workspace>/articles/<name> (default: the source slug)."""
        name = name or self.slug
        return S.copy_package(self.source, self.ws / "articles" / name, slug=name)

    def final_bytes(self, pkg: Path) -> bytes:
        return S.final_file(pkg).read_bytes()

    def release_bytes(self, pkg: Path) -> bytes | None:
        p = pkg / "release/medium-final.md"
        return p.read_bytes() if p.exists() else None

    # -- evidence --------------------------------------------------------------------------------------------------
    def code(self, key: str, res) -> int:
        self.ev["exit_codes"][key] = res.code
        return res.code

    def hash(self, key: str, value: str | None) -> str | None:
        self.ev["hashes"][key] = value
        return value

    def note(self, key: str, value) -> None:
        self.ev["notes"][key] = value

    def auth_hash(self, pkg: Path) -> str | None:
        try:
            return json.loads((pkg / "release/authorization.json").read_text())["binding"]["content_sha256"]
        except (OSError, ValueError, KeyError):
            return None

    def release_files(self, pkg: Path) -> list[str]:
        return [str(p.relative_to(pkg)) for p in (pkg / "release/medium-final.md", pkg / "release/authorization.json") if p.exists()]

    def ledger_states(self, pkg: Path) -> list[str]:
        p = pkg / GATE / "ledger.jsonl"
        if not p.exists():
            return []
        return [str(json.loads(ln)["state"]).split(".")[-1] for ln in p.read_text().splitlines() if ln.strip()]

    def cycles(self, pkg: Path) -> list[dict]:
        p = pkg / GATE / "ledger.jsonl"
        out = []
        for ln in (p.read_text().splitlines() if p.exists() else []):
            e = json.loads(ln)
            if str(e["state"]).endswith("HEAL_CYCLE"):
                d = e.get("detail", {})
                out.append({k: d.get(k) for k in ("index", "category", "kind", "input_sha256", "output_sha256", "result", "repair")})
        return out

    def quarantine(self, pkg: Path) -> dict | None:
        p = pkg / "QUARANTINE.json"
        return json.loads(p.read_text()) if p.exists() else None

    def last_record(self, pkg: Path) -> dict | None:
        runs = sorted((pkg / GATE / "runs").glob("*.json")) if (pkg / GATE / "runs").is_dir() else []
        return json.loads(runs[-1].read_text()) if runs else None

    def snapshot(self, pkg: Path, label: str) -> None:
        """Ledger states, heal cycles, bindings and artifact paths for `pkg`, filed under ev['packages'][label]."""
        auth = None
        try:
            auth = json.loads((pkg / "release/authorization.json").read_text())["binding"]
        except (OSError, ValueError, KeyError):
            pass
        q, rec = self.quarantine(pkg), self.last_record(pkg)
        arts = [str(p) for p in (pkg / "release/medium-final.md", pkg / "release/authorization.json", pkg / "QUARANTINE.json",
                                 pkg / GATE / "SUMMARY.md", pkg / GATE / "ledger.jsonl") if p.exists()]
        runs = pkg / GATE / "runs"
        arts += [str(p) for p in sorted(runs.glob("*.json"))] if runs.is_dir() else []
        binding = auth or (rec or {}).get("binding") or {}
        self.ev.setdefault("packages", {})[label] = {
            "path": str(pkg), "ledger_states": self.ledger_states(pkg), "heal_cycles": self.cycles(pkg),
            "quarantine": {k: q.get(k) for k in ("status", "category", "kind", "retryable")} if q else None,
            "evaluator_id": binding.get("evaluator_id") or (q or {}).get("evaluator_id"),
            "author_corpus_sha256": binding.get("author_corpus_sha256"),
            "final_sha256": S.sha(S.final_file(pkg).read_bytes()) if S.final_file(pkg).exists() else None,
            "release_article_sha256": S.sha(self.release_bytes(pkg)) if self.release_bytes(pkg) is not None else None,
            "authorized_sha256": self.auth_hash(pkg), "artifacts": arts}

    # -- guard -----------------------------------------------------------------------------------------------------
    def paste_flow(self, pkg: Path, tag: str = "") -> tuple[str, str]:
        """Simulated Hermes calls: navigate to the editor, then cmd+v with the clipboard holding what an agent would paste
        (the release file when there is one, else the current final bytes). Returns the two decisions."""
        clip = self.release_bytes(pkg)
        if clip is None:
            clip = self.final_bytes(pkg)
        nav = self.rig.decide(f"{tag}navigate medium.com/new-story", NAV)
        paste = self.rig.paste_with(f"{tag}paste (clipboard = {'release' if self.release_bytes(pkg) is not None else 'final'} bytes)", clip, PASTE)
        return nav["decision"], paste["decision"]
