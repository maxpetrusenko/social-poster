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


UPSTREAM = {"editorial": "validate", "voice": "editorial"}  # stage -> the stage whose artifact is its reference


def record_cuts(pipe: Pipeline, stage: str, cuts: list[dict], reference_sha256: str, candidate_sha256: str) -> None:
    """Replace this stage's ledger entries and rewrite the signed ledger file (record-key HMAC). The state is signed too. Every entry is bound to the
    exact reference and candidate hashes it was declared against; `prune` drops it the moment either no longer describes the run."""
    led = [e for e in pipe.state.get("removals_ledger", []) if e.get("stage") != stage]
    led += [{**c, "stage": stage, "at": now(), "reference_sha256": reference_sha256, "candidate_sha256": candidate_sha256} for c in cuts]
    pipe.state["removals_ledger"] = led
    write_ledger(pipe)


def write_ledger(pipe: Pipeline) -> None:
    atomic_write(pipe.pkg / LEDGER_REL, (json.dumps(R.signed({"entries": pipe.state.get("removals_ledger", [])}), indent=1, sort_keys=True) + "\n").encode())


def _art_sha(pipe: Pipeline, stage: str) -> str | None:
    t = pipe.read_art(stage) if pipe.status(stage) == "DONE" else None
    return sha_bytes(t.encode()) if t is not None else None


def _lineage(pipe: Pipeline) -> set[str]:
    c = pipe.state.get("candidate") or {}
    return {x for x in [c.get("sha256"), *(c.get("history") or [])] if x}


def images_reference_sha(pipe: Pipeline) -> str | None:
    return (pipe.rec("images") or {}).get("reference_frame_sha256") if pipe.status("images") == "DONE" else None


def entry_valid(pipe: Pipeline, e: dict) -> bool:
    """A ledger entry still describes this run: editorial and voice cuts need the stage output and its reference to be the bytes they were declared on;
    a repair cut needs the current reference frame and a candidate descended from the one it was accepted on."""
    stage, ref, cand = e.get("stage"), e.get("reference_sha256"), e.get("candidate_sha256")
    if not (ref and cand):
        return False
    if stage in UPSTREAM:
        return _art_sha(pipe, stage) == cand and _art_sha(pipe, UPSTREAM[stage]) == ref
    if stage == "repair":
        return images_reference_sha(pipe) == ref and cand in _lineage(pipe)
    return False


def repair_binding_ok(pipe: Pipeline) -> bool:
    b = pipe.state.get("repair_cuts_binding") or {}
    return bool(b.get("reference_sha256")) and images_reference_sha(pipe) == b["reference_sha256"] and b.get("candidate_sha256") in _lineage(pipe)


def rebase_valid(pipe: Pipeline) -> bool:
    rb = pipe.state.get("rebase") or {}
    return bool(rb.get("accepted") and rb.get("raw_reference_sha256") and rb["raw_reference_sha256"] == images_reference_sha(pipe)
                and rb.get("candidate_sha256") == (pipe.state.get("candidate") or {}).get("sha256"))


def prune(pipe: Pipeline) -> list[str]:
    """Drop every cut, ledger entry and accepted rebase that is no longer bound to the current reference and candidate hashes (an upstream rework,
    a new frame, a different candidate). Stale material is removed, the ledger file is rewritten, and the stages that relied on it are invalidated, so
    a removal has to be declared and validated again. Returns what was dropped."""
    dropped: list[str] = []
    led = pipe.state.get("removals_ledger") or []
    keep = [e for e in led if isinstance(e, dict) and entry_valid(pipe, e)]
    if len(keep) != len(led):
        dropped.append(f"{len(led) - len(keep)} removals ledger entries")
        pipe.state["removals_ledger"] = keep
        write_ledger(pipe)
    if pipe.state.get("repair_cuts") and not repair_binding_ok(pipe):
        dropped.append("repair cuts")
        pipe.state["repair_cuts"] = []
        pipe.state.pop("repair_cuts_binding", None)
    if pipe.state.get("rebase") and not rebase_valid(pipe):
        dropped.append("accepted rebase")
        pipe.state["rebase"] = None
    if dropped:
        hit = pipe.invalidate(["integrity", "hash", "package", "stop"], "stale_cuts")
        pipe.log("prune_stale_cuts", dropped=dropped, invalidated=hit)
        pipe.save()
    return dropped


def signed_removal_entries(pkg) -> list[dict]:
    """The entries of the signed ledger file as written on disk (empty when absent)."""
    try:
        return json.loads((pkg / LEDGER_REL).read_text()).get("entries", [])
    except (OSError, ValueError):
        return []
