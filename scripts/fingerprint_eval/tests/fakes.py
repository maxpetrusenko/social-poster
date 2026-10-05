"""Offline stand-ins for the gateway, claude and codex. No network, no subprocess."""
from __future__ import annotations

import hashlib
import json
import re
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

from scripts.fingerprint_eval import gateway as G

ARTICLE = """# Title

## Part one

The reactor ran for forty days without a single fault. It was inspected twice by the crew.

- item alpha one
- item beta two

> quoted line stays put

## Part two

The budget doubled in 2021 because of delays in shipping parts. Nobody disputed that figure.
"""

# Same claims, one prose segment non-identical to ARTICLE (sentences swapped): the claim judge's identity pre-filter
# gives a segment equal to the reference zero model calls, so tests that need the judge to run use this as the final.
ARTICLE_REORDERED = ARTICLE.replace("The reactor ran for forty days without a single fault. It was inspected twice by the crew.",
                                    "It was inspected twice by the crew. The reactor ran for forty days without a single fault.")
assert ARTICLE_REORDERED != ARTICLE


class Fakes:
    """Patches Model.complete and guards.embed. `judge_reply(raw_claims, passage, n)` and `extract_reply(text)` may be overridden."""

    def __init__(self):
        self.calls = {"extract": 0, "judge": 0}
        self.models: list[str] = []
        self.extract_reply = self._extract
        self.judge_reply = self._judge
        self.embed = self._embed

    @staticmethod
    def _extract(prompt: str) -> str:
        passage = prompt.split("Passage:\n", 1)[1].strip()
        sents = [s for s in re.split(r"(?<=[.!?])\s+", passage) if s]
        return json.dumps({"role": "r", "propositions": [{"claim": s, "links": []} for s in sents]})

    @staticmethod
    def _judge(prompt: str) -> str:
        if "supported by the reference material" in prompt:  # added.SUPPORT_PROMPT: supported when every word already occurs in the material
            body = prompt.split("Claims:\n", 1)[1]
            claims = re.findall(r"^(\d+)\. (.*)$", body.split("\n\nReference material:", 1)[0], re.M)
            material = set(re.findall(r"\w+", body.split("Reference material:\n", 1)[1].lower()))
            return json.dumps([{"i": int(i), "verdict": "supported" if set(re.findall(r"\w+", c.lower())) <= material else "unsupported", "reason": "r"} for i, c in claims])
        claims = re.findall(r"^(\d+)\. (.*)$", prompt.split("Claims:\n", 1)[1].split("\n\nRewritten passage:", 1)[0], re.M)
        passage = prompt.split("Rewritten passage:\n", 1)[1]
        return json.dumps([{"i": int(i), "verdict": "entailed" if c in passage else "changed", "reason": "r"} for i, c in claims])

    @staticmethod
    def _embed(texts):
        out = []
        for t in texts:
            v = [0.0] * 32
            for w in re.findall(r"\w+", t.lower()):
                v[int(hashlib.md5(w.encode()).hexdigest(), 16) % 32] += 1.0
            out.append(v)
        return out

    def _complete(self, model, prompt, **kw):
        self.models.append(model.model_id)
        if "Extract the atomic factual" in prompt:
            self.calls["extract"] += 1
            return self.extract_reply(prompt)
        self.calls["judge"] += 1
        return self.judge_reply(prompt)

    def __enter__(self):
        self.stack = ExitStack()
        self.stack.enter_context(mock.patch.object(G.Model, "complete", lambda m, p, **kw: self._complete(m, p, **kw)))
        self.stack.enter_context(mock.patch("scripts.fingerprint_eval.guards.embed", lambda t: self.embed(t)))
        self.stack.enter_context(mock.patch("scripts.fingerprint_eval.run.load_gateway_key", lambda: None))
        return self

    def __exit__(self, *a):
        self.stack.close()


def workspace(root: Path, article: str = ARTICLE, draft: str = ARTICLE) -> dict:
    (root / "final").mkdir(); (root / "ref").mkdir(); (root / "author").mkdir(); (root / "pipe").mkdir()
    (root / "final" / "article.md").write_text(article)
    (root / "ref" / "draft.md").write_text(draft)
    return {"article": root / "final" / "article.md", "draft": root / "ref" / "draft.md", "author": root / "author", "pipe": root / "pipe", "out": root / "out"}


def argv(w: dict, *extra: str, draft: bool = True) -> list[str]:
    a = ["--gate", "--article", str(w["article"]), "--author-corpus", str(w["author"]), "--pipeline-corpus", str(w["pipe"]), "--out", str(w["out"]), "--judge", "claude:sonnet"]
    if draft:
        a += ["--draft", str(w["draft"])]
    return a + list(extra)


def gate_json(w: dict) -> dict:
    return json.loads((w["out"] / "gate.json").read_text())
