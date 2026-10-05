"""Package resolution + hashing helpers (follows the contracts.py package conventions; does not import it).

final article rule: version.json.finalFile > article-medium.md > version.json.articleFile. An explicit
--article always wins. The package dir may be any directory (e.g. an experiments/ dir).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

BOOST_KEYS = ("boost", "boosted", "boost_observed", "boostobserved", "isboosted", "boosteddistribution")


@dataclass
class ReviewCtx:
    package: Path
    article_path: Path
    article_rule: str
    source_notes: Path | None
    version: dict = field(default_factory=dict)
    workflow: dict = field(default_factory=dict)

    @property
    def slug(self) -> str:
        return self.package.name

    @property
    def out_dir(self) -> Path:
        return self.package / "evals" / "medium-distribution"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    return sha256_bytes(p.read_bytes())


def read_json(p: Path) -> dict:
    try:
        d = json.loads(p.read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def resolve(package: Path, article: Path | None = None) -> ReviewCtx:
    package = package.resolve()
    version = read_json(package / "version.json")
    workflow = read_json(package / "workflow.json")
    if article is not None:
        art = article if article.is_absolute() else (package / article if (package / article).exists() else Path.cwd() / article)
        rule = "explicit --article"
    else:
        art, rule = None, ""
        ff = version.get("finalFile")
        if ff and (package / ff).exists():
            art, rule = package / ff, "version.json.finalFile"
        elif (package / "article-medium.md").exists():
            art, rule = package / "article-medium.md", "article-medium.md"
        elif version.get("articleFile") and (package / version["articleFile"]).exists():
            art, rule = package / version["articleFile"], "version.json.articleFile"
    if art is None or not art.exists():
        raise FileNotFoundError(f"no article found in {package} (use --article)")
    notes = package / "sources" / "source-notes.md"
    return ReviewCtx(package, art.resolve(), rule, notes if notes.exists() else None, version, workflow)


def boost_observed(*sources: dict):
    """True/False when a package/queue field records it, else None (unknown)."""
    for src in sources:
        for k, v in (src or {}).items():
            if k.lower().replace("_", "") in BOOST_KEYS or k.lower() == "boost_observed":
                if isinstance(v, bool):
                    return v
                if isinstance(v, str) and v.lower() in ("true", "yes", "boosted"):
                    return True
                if isinstance(v, str) and v.lower() in ("false", "no", "not boosted"):
                    return False
                if isinstance(v, dict) and isinstance(v.get("observed"), bool):
                    return v["observed"]
    return None
