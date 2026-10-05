"""Deterministic pre-filter: a prose segment whose normalized text equals the reference segment needs no judge call."""
from __future__ import annotations

import re
import unicodedata

_IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")


def normalize(text: str) -> str:
    """NFKC, lowercase, drop image markdown, collapse whitespace. Punctuation and markdown emphasis are kept on purpose:
    a punctuation edit can change a number (13.2 vs 132), so only whitespace/case/image differences are skipped."""
    t = unicodedata.normalize("NFKC", text)
    t = _IMG.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def identical(candidate: str, reference: str) -> bool:
    return normalize(candidate) == normalize(reference)
