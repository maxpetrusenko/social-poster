"""Typed failure for anything that prevents a reliable evaluation (gate exit code 2)."""
from __future__ import annotations

from .contracts import Category


class EvaluationError(RuntimeError):
    """Setup, cache, extraction, judging, embedding or output failure. The gate never converts this into a pass or a fail verdict.

    `category` and `dependency` let the classifier decide without parsing the message."""

    def __init__(self, message: str = "", category: Category = Category.UNKNOWN_ERROR, dependency: str | None = None):
        super().__init__(message)
        self.category = category
        self.dependency = dependency
