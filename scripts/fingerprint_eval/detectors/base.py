"""Optional paid detector adapters. Measurement only: learn patterns from the flagged sentences; never gate on a score and never optimize against it."""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Protocol


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class DetectorResult:
    name: str
    version: str
    text_sha256: str
    scored_at: str
    ai_prob: float | None = None
    mixed_prob: float | None = None
    human_prob: float | None = None
    flagged_sentences: list[str] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "DetectorResult":
        keys = cls.__dataclass_fields__
        return cls(**{k: v for k, v in d.items() if k in keys})


class Detector(Protocol):
    name: str
    version: str

    def score(self, text: str) -> DetectorResult:
        """Never raises: a transport or parse failure comes back as a result with `error` set."""
        ...
