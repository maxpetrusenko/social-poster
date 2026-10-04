"""Deterministic fake model layer for the e2e suite.

Patches gateway.chat / embed / claude_cli / codex_cli (and every module that imported them by name) plus
time.sleep. Judging is by real text comparison, never by a canned verdict, so a mutated article really
fails and an untouched one really passes. Scripted faults reproduce infrastructure failures.

Usage:
    with FakeModels(faults=[Fault("*", "timeout", times=2)]) as fm:
        ...  # call code under test
    fm.sleeps, fm.calls, fm.models_used
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from contextlib import ExitStack
from dataclasses import dataclass
from unittest import mock

from scripts.fingerprint_eval import gateway as G

CHANNELS = ("chat", "embed", "claude_cli", "codex_cli")
FAULT_KINDS = ("timeout", "http_5xx", "http_524", "refused", "malformed", "model_not_found")

# kind -> (message, category name, dependency family). Messages mirror what gateway.py really produces.
_ERRORS = {
    "timeout": ("network: timed out", "MODEL_TIMEOUT"),
    "http_5xx": ("HTTP 503: upstream unavailable", "GATEWAY_FAILURE"),
    "http_524": ("HTTP 524: a timeout occurred", "GATEWAY_FAILURE"),
    "refused": ("network: <urlopen error [Errno 61] Connection refused>", "GATEWAY_FAILURE"),
    "model_not_found": ("HTTP 404: model not found", "MODEL_UNAVAILABLE"),
}
_DEP = {"chat": "gateway-chat", "embed": "gateway-embed", "claude_cli": "claude-cli", "codex_cli": "codex-cli"}


@dataclass
class Fault:
    """channel: one of CHANNELS or "*". times: number of matching calls to fail (None = forever).
    skip: let this many matching calls succeed first. model: only fail calls whose model id contains this."""
    channel: str
    kind: str
    times: int | None = 1
    skip: int = 0
    model: str | None = None
    _seen: int = 0
    _fired: int = 0

    def __post_init__(self):
        assert self.channel == "*" or self.channel in CHANNELS, self.channel
        assert self.kind in FAULT_KINDS, self.kind

    def applies(self, channel: str, model: str | None) -> bool:
        if self.channel not in ("*", channel):
            return False
        if self.model and (model is None or self.model not in model):
            return False
        return True

    def fire(self) -> bool:
        self._seen += 1
        if self._seen <= self.skip:
            return False
        if self.times is not None and self._fired >= self.times:
            return False
        self._fired += 1
        return True


def make_error(kind: str, channel: str) -> Exception:
    """A GatewayError carrying `category` and `dependency` attributes (contract: EvaluationError gains both)."""
    msg, cat = _ERRORS[kind]
    err = G.GatewayError(msg)
    err.category = cat          # a Category name; W2 may expect the enum, which is a str subclass of the same value
    err.dependency = _DEP[channel]
    try:  # prefer the real enum when the contract module is importable
        from scripts.fingerprint_eval.contracts import Category
        err.category = Category(cat)
    except Exception:  # noqa: BLE001
        pass
    return err


# ---- text comparison -------------------------------------------------------------------------------
_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")


def norm(text: str) -> str:
    text = _LINK.sub(r"\1", text)
    text = re.sub(r"[*_`>#]", "", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"\w+", norm(text)))


def verdict_for(claim: str, support: str) -> str:
    """entailed iff the claim text occurs in the support; changed iff a support sentence overlaps heavily
    but differs (altered number/word); missing otherwise."""
    if norm(claim) in norm(support):
        return "entailed"
    ct = _tokens(claim)
    best = 0.0
    for sent in re.split(r"(?<=[.!?])\s+", norm(support)):
        st = _tokens(sent)
        if ct and st:
            best = max(best, len(ct & st) / len(ct | st))
    return "changed" if best >= 0.5 else "missing"


def _numbered_claims(block: str) -> list[tuple[int, str]]:
    return [(int(i), c) for i, c in re.findall(r"^(\d+)\. (.*)$", block, re.M)]


class FakeModels:
    def __init__(self, faults: list[Fault] | None = None, *, judge_reply=None):
        self.faults = list(faults or [])
        self.calls: dict[str, int] = {c: 0 for c in CHANNELS}
        self.faults_fired: list[tuple[str, str]] = []
        self.models_used: list[str] = []
        self.sleeps: list[float] = []
        self.judge_override = judge_reply  # optional callable(prompt) -> str

    # -- scripted faults ---------------------------------------------------------------------------
    def _maybe_fault(self, channel: str, model: str | None) -> str | None:
        """Raises for error faults; returns "malformed" when the reply must be garbage."""
        self.calls[channel] += 1
        if model:
            self.models_used.append(model)
        for f in self.faults:
            if f.applies(channel, model) and f.fire():
                self.faults_fired.append((channel, f.kind))
                if f.kind == "malformed":
                    return "malformed"
                raise make_error(f.kind, channel)
        return None

    # -- replies -----------------------------------------------------------------------------------
    def _reply(self, prompt: str) -> str:
        if self.judge_override:
            return self.judge_override(prompt)
        if "Extract the atomic factual" in prompt:
            return self._extract(prompt)
        return self._judge(prompt)

    @staticmethod
    def _extract(prompt: str) -> str:
        passage = prompt.split("Passage:\n", 1)[1].strip()
        props = []
        for s in (x for x in re.split(r"(?<=[.!?])\s+", passage) if len(x.split()) >= 5):  # like the real extractor: fragments are not claims
            props.append({"claim": s.strip(), "links": [m.group(0) for m in re.finditer(r"(?<!!)\[[^\]]*\]\([^)]*\)", s)]})
        return json.dumps({"role": "fixture role", "propositions": props})

    @staticmethod
    def _judge(prompt: str) -> str:
        """Gate judge prompt (Claims: / Rewritten passage:) or any numbered-claims prompt: the support is
        everything in the prompt that is not the claim list."""
        if "Claims:\n" in prompt and "Rewritten passage:\n" in prompt:
            block = prompt.split("Claims:\n", 1)[1].split("\n\nRewritten passage:", 1)[0]
            support = prompt.split("Rewritten passage:\n", 1)[1]
            claims = _numbered_claims(block)
        else:
            claims = _numbered_claims(prompt)
            support = re.sub(r"^\d+\. .*$", "", prompt, flags=re.M)
        if "supported by the reference material" in prompt:  # added.SUPPORT_PROMPT: supported/unsupported vocabulary
            sup = _tokens(support)  # supported when every content word already occurs in the reference (style-only rephrasing)
            return json.dumps([{"i": i, "verdict": "supported" if verdict_for(c, support) == "entailed" or _tokens(c) <= sup else "unsupported",
                                "reason": "text comparison"} for i, c in claims])
        return json.dumps([{"i": i, "verdict": verdict_for(c, support), "reason": "text comparison"} for i, c in claims])

    @staticmethod
    def embed_vectors(texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * 64
            for w in re.findall(r"\w+", t.lower()):
                v[int(hashlib.md5(w.encode()).hexdigest(), 16) % 64] += 1.0
            if not any(v):
                v[0] = 1.0
            out.append(v)
        return out

    # -- patched entry points ----------------------------------------------------------------------
    def chat(self, model, prompt, system=None, temperature=0.4, max_tokens=7000):
        if self._maybe_fault("chat", model):
            return "this is {not json"
        return self._reply(prompt)

    def claude_cli(self, prompt, model="sonnet", timeout=300):
        if self._maybe_fault("claude_cli", model):
            return "```json\n[{broken"
        return self._reply(prompt)

    def codex_cli(self, prompt, timeout=400):
        if self._maybe_fault("codex_cli", "codex"):
            return "no json here"
        return self._reply(prompt)

    def embed(self, texts):
        if self._maybe_fault("embed", None):
            return [[float("nan")] for _ in texts]
        return self.embed_vectors(list(texts))

    def sleep(self, seconds):
        self.sleeps.append(seconds)

    # -- context manager ---------------------------------------------------------------------------
    def __enter__(self):
        self.stack = ExitStack()
        import importlib
        for m in ("gate", "judge", "guards", "rewrite", "extract_cache", "authz", "heal", "repair", "circuit", "release"):
            try:  # preload so name-imports of the originals are visible to the scan below
                importlib.import_module(f"scripts.fingerprint_eval.{m}")
            except Exception:  # noqa: BLE001  not merged yet, or broken: the suite guards on that separately
                pass
        originals = {"chat": G.chat, "claude_cli": G.claude_cli, "codex_cli": G.codex_cli, "embed": G.embed}
        ours = {"chat": self.chat, "claude_cli": self.claude_cli, "codex_cli": self.codex_cli, "embed": self.embed}
        # patch gateway and every scripts.fingerprint_eval module that imported the name directly
        for modname, mod in list(sys.modules.items()):
            if not modname.startswith("scripts.fingerprint_eval") or mod is None or ".tests" in modname:
                continue
            for name, orig in originals.items():
                if getattr(mod, name, None) is orig:
                    self.stack.enter_context(mock.patch.object(mod, name, ours[name]))
        self.stack.enter_context(mock.patch.object(time, "sleep", self.sleep))
        self.stack.enter_context(mock.patch.dict("os.environ", {"LLM_GATEWAY_API_KEY": "fake-key", "FG_E2E_FAKES": "1"}))
        return self

    def __exit__(self, *exc):
        self.stack.close()
