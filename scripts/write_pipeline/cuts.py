"""Declared editorial cuts. The editorial and voice stages may declare removals; a declared sentence that exactly matches a reference
sentence and is really gone from the candidate is an intentional cut. It is taken out of the reference the claims gate compares
against, so the gate still judges every changed and added claim, and it is written to a signed ledger. The final integrity gate
never uses this: it compares the post-editorial reference with the final bytes as before."""
from __future__ import annotations

import json
import re

from scripts.fingerprint_eval import record as R
from scripts.fingerprint_eval.textutil import split_sentences, strip_inline

from . import mdlib as M
from .core import Pipeline, atomic_write, now, sha_bytes

LEDGER_REL = "write-pipeline/removals-ledger.json"


def _key(s: str) -> str:
    return re.sub(r"\s+", " ", strip_inline(s).replace("\n", " ")).strip()


def apply_cuts(ref: str, cand: str, removals) -> tuple[str, list[dict]]:
    """(reference without the declared and really-removed sentences, the cuts honoured). Unmatched declarations are ignored."""
    declared: dict[str, dict] = {}
    for r in removals if isinstance(removals, list) else []:
        if isinstance(r, dict) and isinstance(r.get("text"), str) and _key(r["text"]):
            declared[_key(r["text"])] = r
    if not declared:
        return ref, []
    kept_in_cand = {_key(s) for b in M.blocks(cand) if b.kind == "paragraph" for s in split_sentences(b.text)}
    out, cuts = [], []
    for b in M.blocks(ref):
        if b.kind != "paragraph":
            out.append(b.text)
            continue
        sents = split_sentences(b.text)
        keep = []
        for s in sents:
            k = _key(s)
            if k in declared and k not in kept_in_cand:
                cuts.append({"sentence": k, "sentence_sha256": sha_bytes(k.encode()), "reason": str(declared[k].get("reason", ""))[:200]})
            else:
                keep.append(s)
        if keep:
            out.append(b.text if len(keep) == len(sents) else " ".join(keep))
    return ("\n\n".join(out) + "\n", cuts) if cuts else (ref, [])


def record_cuts(pipe: Pipeline, stage: str, cuts: list[dict]) -> None:
    """Replace this stage's ledger entries and rewrite the signed ledger file (record-key HMAC). The state is signed too."""
    led = [e for e in pipe.state.get("removals_ledger", []) if e.get("stage") != stage]
    led += [{**c, "stage": stage, "at": now()} for c in cuts]
    pipe.state["removals_ledger"] = led
    atomic_write(pipe.pkg / LEDGER_REL, (json.dumps(R.signed({"entries": led}), indent=1, sort_keys=True) + "\n").encode())
