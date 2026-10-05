"""Deterministic pre-filter: a prose segment whose normalized text equals the reference segment needs no judge call.
The implementation lives in judge.py (the production policy); re-exported here for the calibration runner."""
from __future__ import annotations

from ..judge import identical, normalize  # noqa: F401
