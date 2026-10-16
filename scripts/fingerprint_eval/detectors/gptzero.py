"""GPTZero adapter. Sending the final text to GPTZero is approved by Max; the result is measurement only.

REQUEST SHAPE: NOT VERIFIED against official docs. https://gptzero.me/docs is a JS app (browse.sh returned an empty body on 2 attempts, 2026-10-16).
Relied on instead (secondary, third-party generated, checked 2026-10-16):
  https://raw.githubusercontent.com/api-evangelist/gptzero/main/skills/gptzero-detect-ai-text.md
  POST https://api.gptzero.me/v2/predict/text, header X-API-Key, JSON body {"document": <text>, "multilingual": <bool, optional>}
  response: classification human|ai|mixed, completely_generated_prob, average_generated_prob, sentences[].generated_prob.
Response nesting is also NOT VERIFIED: the parser accepts both top-level fields and documents[0] (with class_probabilities {ai, mixed, human}
and sentences[{sentence, generated_prob, highlight_sentence_for_ai}]) and records whatever is missing as None.
"""
from __future__ import annotations

import json
import urllib.request
from typing import Callable

from .base import DetectorResult, text_sha256, utc_now

URL = "https://api.gptzero.me/v2/predict/text"
KEY_ENV = "GPTZERO_API_KEY"
FLAG_AT = 0.5
Transport = Callable[[str, dict, dict], dict]  # (url, headers, json body) -> parsed JSON response


def urllib_transport(url: str, headers: dict, body: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={**headers, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310  fixed https url
        return json.loads(r.read().decode("utf-8"))


def _num(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


class GPTZero:
    name = "gptzero"
    version = "v2"

    def __init__(self, api_key: str, transport: Transport | None = None):
        self._key = api_key
        self._transport = transport or urllib_transport

    def score(self, text: str) -> DetectorResult:
        res = DetectorResult(self.name, self.version, text_sha256(text), utc_now())
        try:
            raw = self._transport(URL, {"X-API-Key": self._key, "Accept": "application/json"}, {"document": text, "multilingual": False})
            doc = (raw.get("documents") or [raw])[0] if isinstance(raw, dict) else None
            if not isinstance(doc, dict):
                raise ValueError("unexpected response shape")
            cp = doc.get("class_probabilities") or {}
            res.ai_prob = _num(cp.get("ai", doc.get("completely_generated_prob")))
            res.mixed_prob, res.human_prob = _num(cp.get("mixed")), _num(cp.get("human"))
            if res.ai_prob is None:
                raise ValueError("response carries no AI probability")
            for s in doc.get("sentences") or []:
                if isinstance(s, dict) and s.get("sentence") and (s.get("highlight_sentence_for_ai") is True or (_num(s.get("generated_prob")) or 0) >= FLAG_AT):
                    res.flagged_sentences.append(str(s["sentence"]).strip())
        except Exception as e:  # noqa: BLE001  never blocks the pipeline; the key is never echoed
            res.error = f"{type(e).__name__}: {str(e)[:160]}".replace(self._key, "***")
            res.ai_prob = res.mixed_prob = res.human_prob = None
            res.flagged_sentences = []
        return res
