"""The Medium-facing step. Prototype: dry-run only, no browser.

Real implementation (not built here): the broker's own Playwright/Chrome profile, owned by the broker user. Order is
fixed and enforced by `execute`: paste exact release bytes, read the editor back, `compare(release_md, editor_html)`,
and only if that passes click Publish/Schedule/Save draft. Any compare failure stops before the click.

`compare` is the W13 interface (canonical comparison of release markdown against editor HTML). Until it is wired the
stub FAILS CLOSED, so a real executor cannot click through an unwired comparison."""
from __future__ import annotations

from typing import Callable, Protocol

Comparator = Callable[[str, str], "tuple[bool, list[str]]"]


def compare_stub(release_md: str, editor_html: str) -> tuple[bool, list[str]]:
    return False, ["canonical comparison is not wired (W13 interface compare(release_md, editor_html) -> (ok, diffs))"]


class Editor(Protocol):
    dry_run: bool

    def paste(self, release_bytes: bytes) -> None: ...
    def read_back(self) -> str: ...
    def click(self, action: str, schedule_at: str | None) -> None: ...


class DryRunEditor:
    """Records what would happen. Touches nothing."""
    dry_run = True

    def __init__(self) -> None:
        self.steps: list[dict] = []

    def paste(self, release_bytes: bytes) -> None:
        import hashlib
        self.steps.append({"step": "paste", "bytes": len(release_bytes), "sha256": hashlib.sha256(release_bytes).hexdigest()})

    def read_back(self) -> str:
        self.steps.append({"step": "read_back", "note": "would read the editor HTML"})
        return ""

    def click(self, action: str, schedule_at: str | None) -> None:
        self.steps.append({"step": "click", "action": action, **({"schedule_at": schedule_at} if schedule_at else {})})


def execute(release_bytes: bytes, action: str, schedule_at: str | None, editor: Editor, comparator: Comparator = compare_stub) -> dict:
    """paste -> read back -> compare -> click. Returns {"ok", "diffs", "compare_ran"}; never clicks after a failed compare."""
    editor.paste(release_bytes)
    html = editor.read_back()
    if editor.dry_run:
        editor.steps.append({"step": "compare", "note": "would run compare(release_md, editor_html); click only if ok"})  # type: ignore[attr-defined]
        editor.click(action, schedule_at)
        return {"ok": True, "diffs": [], "compare_ran": False}
    ok, diffs = comparator(release_bytes.decode("utf-8"), html)
    if not ok:
        return {"ok": False, "diffs": list(diffs), "compare_ran": True}
    editor.click(action, schedule_at)
    return {"ok": True, "diffs": [], "compare_ran": True}
