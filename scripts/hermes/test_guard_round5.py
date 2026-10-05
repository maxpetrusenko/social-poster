"""Codex round-5: computer_use input to ANY app (terminals included) is a Medium mutation."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))
import medium_publish_guard as g  # noqa: E402
from test_medium_publish_guard import env, payload  # noqa: E402,F401


@pytest.mark.parametrize("app", ["Terminal", "iTerm2", "Warp", "Ghostty", "kitty", "Alacritty", "WezTerm", "Finder"])
def test_terminal_computer_use_input_blocked_without_active(app, env):
    typ = payload("computer_use", {"action": "type", "text": "open https://medium.com/new-story", "app": app})
    enter = payload("computer_use", {"action": "key", "keys": "return", "app": app})
    for p in (typ, enter):
        assert g.classify(p, env)[0]
        assert not g.decide(p, env).allow
        assert g.could_mutate(p)


def test_allowlist_is_empty_by_default():
    assert g.CU_NON_BROWSER_ALLOWLIST == frozenset()
