"""LLM access: Max's OpenAI-compatible gateway, plus `claude -p` (subscription only).

The API key is read from the environment (LLM_GATEWAY_API_KEY) and never logged,
printed, or placed in argv.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

def normalize_base_url(url: str) -> str:
    """Doppler stores LLM_GATEWAY_URL without the /v1 suffix; OpenAI-compatible paths need it."""
    url = url.rstrip("/")
    return url if url.endswith("/v1") else f"{url}/v1"


BASE_URL = normalize_base_url(os.environ.get("LLM_GATEWAY_URL", "https://llm.maxpetrusenko.com/v1"))
EMBED_MODEL = "nomic-embed-text:latest"

FAMILY_PREFIXES = [
    ("gpt", "openai"), ("codex", "openai"), ("chatgpt", "openai"), ("o1", "openai"), ("o3", "openai"),
    ("claude", "anthropic"), ("qwen", "alibaba-qwen"), ("gemma", "google"), ("gemini", "google"),
    ("llama", "meta"), ("mistral", "mistral"), ("deepseek", "deepseek"), ("nomic", "nomic"),
]


def family_of(model: str) -> str:
    m = model.lower()
    for prefix, fam in FAMILY_PREFIXES:
        if m.startswith(prefix) or f"/{prefix}" in m:
            return fam
    return "unknown"


def _ssl_ctx() -> ssl.SSLContext:
    """System CA bundle first (macOS python builds often lack one); also trust SSL_CERT_FILE
    (e.g. a local broker CA) in addition, not instead."""
    sysca = "/etc/ssl/cert.pem"
    ctx = ssl.create_default_context(cafile=sysca if os.path.exists(sysca) else None)
    extra = os.environ.get("SSL_CERT_FILE")
    if extra and os.path.exists(extra):
        try:
            ctx.load_verify_locations(cafile=extra)
        except ssl.SSLError:
            pass
    return ctx


class GatewayError(RuntimeError):
    pass


def _key() -> str:
    k = os.environ.get("LLM_GATEWAY_API_KEY", "")
    if not k:
        raise GatewayError("LLM_GATEWAY_API_KEY not set (load from Doppler api_keys/dev into the env)")
    return k


def _post(path: str, payload: dict, timeout: int = 900, retries: int = 1) -> dict:
    req_headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json", "User-Agent": "fingerprint-eval/1.0 (curl-compatible)"}
    last: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(f"{BASE_URL}{path}", data=json.dumps(payload).encode(), headers=req_headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")[:300]
            if e.code in (400, 401, 403, 404):
                raise GatewayError(f"HTTP {e.code}: {body}") from None
            last = GatewayError(f"HTTP {e.code}: {body}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = GatewayError(f"network: {e}")
        time.sleep(2 * (attempt + 1))
    raise last or GatewayError("unknown gateway failure")


def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def chat(model: str, prompt: str, system: str | None = None, temperature: float = 0.4, max_tokens: int = 7000) -> str:
    """Streams (SSE) so Cloudflare's ~100s no-byte timeout (HTTP 524) never trips on slow reasoning models."""
    msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    payload = {"model": model, "messages": msgs, "temperature": temperature, "max_tokens": max_tokens, "stream": True}
    headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json", "User-Agent": "fingerprint-eval/1.0 (curl-compatible)"}
    last: Exception | None = None
    for attempt in range(2):
        req = urllib.request.Request(f"{BASE_URL}/chat/completions", data=json.dumps(payload).encode(), headers=headers)
        parts: list[str] = []
        try:
            with urllib.request.urlopen(req, timeout=300, context=_ssl_ctx()) as r:
                for raw in r:
                    line = raw.decode(errors="ignore").strip()
                    if not line.startswith("data:") or line.endswith("[DONE]"):
                        continue
                    try:
                        delta = json.loads(line[5:])["choices"][0].get("delta", {})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
                    parts.append(delta.get("content") or "")
            out = strip_think("".join(parts))
            if out:
                return out
            last = GatewayError("empty content (reasoning consumed max_tokens)")
        except urllib.error.HTTPError as e:
            last = GatewayError(f"HTTP {e.code}: {e.read().decode(errors='ignore')[:200]}")
            if e.code in (400, 401, 403, 404):
                raise last from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = GatewayError(f"network: {e}")
    raise last or GatewayError("chat failed")


def embed(texts: list[str]) -> list[list[float]]:
    data = _post("/embeddings", {"model": EMBED_MODEL, "input": texts})
    return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]


def claude_cli(prompt: str, model: str = "sonnet", timeout: int = 300) -> str:
    """Subscription `claude -p`; strips API keys so no API credits are used. Prompt goes via stdin."""
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    p = subprocess.run(["claude", "-p", "--model", model], input=prompt, capture_output=True, text=True, timeout=timeout, env=env)
    if p.returncode != 0:
        raise GatewayError(f"claude -p failed rc={p.returncode}: {p.stderr[:300]}")
    return p.stdout.strip()


def codex_cli(prompt: str, timeout: int = 400) -> str:
    """ChatGPT-subscription `codex exec` (no API key). Prompt via stdin, last message via -o file."""
    import tempfile
    exe = os.environ.get("CODEX_BIN") or "/Applications/ChatGPT.app/Contents/Resources/codex"
    if not os.path.exists(exe):
        exe = "codex"
    env = {k: v for k, v in os.environ.items() if k not in ("OPENAI_API_KEY",)}
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "last.txt")
        p = subprocess.run([exe, "exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", td, "-o", out, "-"],
                           input=prompt, capture_output=True, text=True, timeout=timeout, env=env)
        if p.returncode != 0 or not os.path.exists(out):
            raise GatewayError(f"codex exec failed rc={p.returncode}: {(p.stderr or p.stdout)[-300:]}")
        return open(out).read().strip()


def extract_json(text: str):
    """Pull the first JSON object/array out of a model reply."""
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.M)
    for opener, closer in (("{", "}"), ("[", "]")):
        s, e = text.find(opener), text.rfind(closer)
        if s != -1 and e > s:
            try:
                return json.loads(text[s : e + 1])
            except json.JSONDecodeError:
                continue
    raise GatewayError(f"no JSON in reply: {text[:200]!r}")


@dataclass(frozen=True)
class Model:
    """A rewriter/judge backend."""
    name: str          # display + file-safe-ish name
    backend: str       # "gateway" | "claude-cli"
    model_id: str

    @property
    def family(self) -> str:
        if self.backend == "codex-cli":
            return "openai"
        return "anthropic" if self.backend == "claude-cli" else family_of(self.model_id)

    def complete(self, prompt: str, **kw) -> str:
        if self.backend == "claude-cli":
            return claude_cli(prompt, self.model_id)
        if self.backend == "codex-cli":
            return codex_cli(prompt)
        return chat(self.model_id, prompt, **kw)


def resolve_model(spec: str) -> Model:
    if spec in ("codex", "gpt"):
        return Model("codex", "codex-cli", "codex")
    if spec.startswith("claude"):
        alias = spec.split(":", 1)[1] if ":" in spec else "sonnet"
        return Model(f"claude-{alias}", "claude-cli", alias)
    return Model(spec, "gateway", spec)
