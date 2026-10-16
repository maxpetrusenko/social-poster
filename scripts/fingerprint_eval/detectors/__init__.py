"""Optional paid detector adapters (measurement only). `get(name, env, transport)` returns a ready detector or None when it is unknown or unconfigured."""
from __future__ import annotations

import os

from .base import Detector, DetectorResult


def get(name: str, env=None, transport=None) -> Detector | None:
    env = os.environ if env is None else env
    if (name or "").strip().lower() == "gptzero":
        from . import gptzero as G
        key = env.get(G.KEY_ENV, "")
        return G.GPTZero(key, transport) if key else None
    return None


__all__ = ["Detector", "DetectorResult", "get"]
