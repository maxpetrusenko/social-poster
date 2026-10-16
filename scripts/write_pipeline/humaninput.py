"""Stage `human`: the author's own words, asked for once, after the angle and before the outline.

Three questions (a real experience with specifics, the author's opinion, one concrete detail or an outline). The answers are the only
source of first-person experience the pipeline accepts besides captured author-kind sources (experience.py traces every such sentence to
them). No answer is a recorded outcome, not a failure: the run continues with no first-person experience.

Schema: {status: answered|no_answer, answers: {experience, opinion, detail_or_outline}, outline_supplied: bool, method: text|voice,
         transcript_file?: str (voice: a path inside the package), asked_at, answered_at? (required when answered)}
"""
from __future__ import annotations

import re
from pathlib import Path

from .core import PipelineError, now, safe_path

HUMAN_ENV = "WRITE_PIPELINE_HUMAN"  # "require": a no_answer submit ends BLOCKED_INPUT instead of continuing
ANSWER_KEYS = ("experience", "opinion", "detail_or_outline")
STATUSES = ("answered", "no_answer")
METHODS = ("text", "voice")
FILE_NAME = "HUMAN_INPUT.md"


def questions(angle: dict) -> list[str]:
    """The three questions, tied to the angle's own question so the author answers about this article and not in general."""
    topic = str((angle or {}).get("question") or (angle or {}).get("angle") or "this topic").strip().rstrip("?.")
    return [
        f"Describe one real experience of your own with this ({topic}). What happened? Give specifics: when, what you did, a number or a name.",
        "What is your own opinion on it, in your words? Where do you disagree with the common view?",
        "Give one concrete detail only you would know about it (a number, a failure, a tool, a decision). Or paste the outline you want the article to follow.",
    ]


def answered_text(human: dict) -> str:
    """All answer text of an answered record, labelled; empty for no_answer."""
    if not isinstance(human, dict) or human.get("status") != "answered":
        return ""
    a = human.get("answers") or {}
    return "\n\n".join(str(a.get(k) or "").strip() for k in ANSWER_KEYS if str(a.get(k) or "").strip())


def validate(data: dict, pkg: Path | None = None) -> dict:
    reasons: list[str] = []
    if data.get("status") not in STATUSES:
        reasons.append(f"human: status must be one of {list(STATUSES)}")
    ans = data.get("answers")
    if not isinstance(ans, dict) or set(ans) != set(ANSWER_KEYS) or not all(isinstance(ans[k], str) for k in ANSWER_KEYS):
        reasons.append(f"human: answers must be an object of strings with exactly the keys {list(ANSWER_KEYS)}")
        ans = {}
    if data.get("status") == "answered":
        empty = [k for k in ANSWER_KEYS if not str(ans.get(k, "")).strip()]
        if empty:
            reasons.append(f"human: status answered needs a non-empty answer for {empty}; submit status no_answer to skip")
        if not str(data.get("answered_at") or "").strip():
            reasons.append("human: answered_at is required when status is answered")
    elif data.get("status") == "no_answer" and any(str(ans.get(k, "")).strip() for k in ANSWER_KEYS):
        reasons.append("human: status no_answer must carry empty answers (an answered record has status answered)")
    if not isinstance(data.get("outline_supplied"), bool):
        reasons.append("human: outline_supplied must be true or false")
    elif data["outline_supplied"] and data.get("status") != "answered":
        reasons.append("human: outline_supplied is true only for an answered record")
    if data.get("method") not in METHODS:
        reasons.append(f"human: method must be one of {list(METHODS)}")
    if not str(data.get("asked_at") or "").strip():
        reasons.append("human: asked_at is required")
    tf = data.get("transcript_file")
    if data.get("method") == "voice" and data.get("status") == "answered" and not tf:
        reasons.append("human: a voice answer needs transcript_file (the transcript stored in the package)")
    if tf is not None:
        if not isinstance(tf, str) or not tf.strip():
            reasons.append("human: transcript_file must be a path inside the package")
        elif pkg is not None:
            try:
                if not safe_path(pkg, tf).is_file():
                    reasons.append(f"human: transcript_file {tf!r} does not exist in the package")
            except PipelineError as e:
                reasons.append(f"human: transcript_file: {e}")
    extra = set(data) - {"status", "answers", "outline_supplied", "method", "transcript_file", "asked_at", "answered_at"}
    if extra:
        reasons.append(f"human: unknown keys {sorted(extra)}")
    return {"ok": not reasons, "reasons": reasons, "data": data}


# ---- HUMAN_INPUT.md ---------------------------------------------------------------------------------------------
_HEAD = re.compile(r"^([a-z_]+):[ \t]*(.*)$")
_SEC = re.compile(r"^##[ \t]+([a-z_]+)[ \t]*$", re.I)


def render_md(angle: dict, asked_at: str | None = None) -> str:
    """The file an unattended run leaves for the author: the questions, blank answers, status no_answer."""
    qs = questions(angle)
    L = ["# HUMAN_INPUT", "", "status: no_answer", "method: text", "outline_supplied: no", f"asked_at: {asked_at or now()}", "answered_at:", "transcript_file:", "",
         "Fill in the answers below, set `status: answered` and `answered_at`, then run `submit human --file HUMAN_INPUT.md`. Leave it as is to skip.", ""]
    for k, q in zip(ANSWER_KEYS, qs):
        L += [f"## {k}", f"Question: {q}", "Answer:", "", ""]
    return "\n".join(L)


def parse_md(text: str) -> dict:
    """HUMAN_INPUT.md -> the schema dict. Header lines are `key: value` before the first `## section`; a section is
    `## experience|opinion|detail_or_outline`, a `Question:` line and the answer text after `Answer:`. Bad input yields keys that validate() rejects."""
    head: dict[str, str] = {}
    answers = dict.fromkeys(ANSWER_KEYS, "")
    cur: str | None = None
    in_answer = False
    buf: dict[str, list[str]] = {k: [] for k in ANSWER_KEYS}
    for ln in text.replace("\r\n", "\n").split("\n"):
        m = _SEC.match(ln)
        if m:
            cur = m.group(1).lower() if m.group(1).lower() in ANSWER_KEYS else None
            in_answer = False
            continue
        if cur is None:
            h = _HEAD.match(ln.strip())
            if h and not ln.startswith("#"):
                head[h.group(1)] = h.group(2).strip()
            continue
        if not in_answer:
            if ln.strip().lower().startswith("answer:"):
                in_answer = True
                rest = ln.split(":", 1)[1].strip()
                if rest:
                    buf[cur].append(rest)
            continue
        buf[cur].append(ln)
    for k in ANSWER_KEYS:
        answers[k] = "\n".join(buf[k]).strip()
    out: dict = {"status": head.get("status", "").lower(), "answers": answers, "outline_supplied": head.get("outline_supplied", "no").lower() in ("yes", "true", "1"),
                 "method": (head.get("method") or "text").lower(), "asked_at": head.get("asked_at", "")}
    if head.get("answered_at"):
        out["answered_at"] = head["answered_at"]
    if head.get("transcript_file"):
        out["transcript_file"] = head["transcript_file"]
    return out
