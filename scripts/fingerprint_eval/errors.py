"""Typed failure for anything that prevents a reliable evaluation (gate exit code 2)."""
from __future__ import annotations


class EvaluationError(RuntimeError):
    """Setup, cache, extraction, judging, embedding or output failure. The gate never converts this into a pass or a fail verdict."""
