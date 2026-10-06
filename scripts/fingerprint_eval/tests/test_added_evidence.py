"""The added-claim judge reads the ledger evidence passages and source excerpts for the claims a sentence maps to, not only the reference section.

Fixture: sentences from the one-book-v2 repair candidates against that run's evidence ledger rows: 7 pure restatements, 3 sentences that add an
inference ("sharper", an ordering, a contrast; a model judge must reject them, the stand-in below is too crude to say), 5 new-fact controls. The model judge is replaced by a stand-in that reads ONLY the "Evidence passages" block of the prompt, so
the test measures whether the right passages reach the judge and whether a new fact still has nothing to stand on.
"""
import json
import re
from pathlib import Path

from scripts.fingerprint_eval import added

from .fakes import Fakes

FX = json.loads((Path(__file__).parent / "fixtures" / "restatements.json").read_text())
REF = "# T\n\n## The same decision, rated twice\n\nOutcome bias is a measured tendency. Researchers rated decisions.\n"
STOP = added._CLAIM_STOP


def final_with(sentence: str) -> str:
    return REF + f"\n{sentence}\n"


def evidence_block(prompt: str) -> str:
    m = re.search(r"Evidence passages most relevant[^\n]*\n(.*?)(?:\n\nReference section:|\n\nSource notes:|\Z)", prompt, re.S)
    return m.group(1) if m else ""


def grounded_judge(prompt: str) -> str:
    """Supported iff every number and capitalised name of the claim, and 60% of its content tokens (by 5-letter stem), occur in the evidence block."""
    block = evidence_block(prompt).lower().replace("’", "'")
    toks = set(re.findall(r"[a-z0-9$%.,']+", block))
    claims = re.findall(r"^(\d+)\. (.*)$", prompt.split("Claims:\n", 1)[1].split("\n\nReference material:", 1)[0], re.M)
    out = []
    for i, c in claims:
        ct = added._content_tokens(c)
        hit = sum(1 for t in ct if t[:5] in block) / max(1, len(ct))  # prefix match: a stand-in judge that tolerates inflection
        hard = [w for w in re.findall(r"\$?\d[\d,.]*%?|(?<!^)(?<!\. )\b[A-Z][a-z]{3,}\b", c) if w.lower().strip(".,") not in block]
        out.append({"i": int(i), "verdict": "supported" if hit >= 0.6 and not hard else "unsupported", "reason": "r"})
    return json.dumps(out)


def run(sentence: str, notes: str = FX["notes"]) -> dict:
    f = Fakes()
    f.judge_reply = grounded_judge
    with f:
        return added.check_added(REF, final_with(sentence), notes, "claude:sonnet", "claude:sonnet")


def test_restatements_of_supported_claims_are_accepted_and_new_facts_rejected():
    ok = [s for s in FX["restatements"] if not run(s)["unsupported"]]
    bad = [s for s in FX["new_facts"] if run(s)["unsupported"]]
    assert len(ok) == len(FX["restatements"]) == 7, [s for s in FX["restatements"] if s not in ok]   # every pure restatement reaches the judge with its passage
    assert len(bad) == len(FX["new_facts"]), [s for s in FX["new_facts"] if s not in bad]  # every new fact still rejected


def test_the_evidence_block_leads_the_material_and_carries_the_ledger_passage():
    seen = {}
    f = Fakes()
    f.judge_reply = lambda prompt: (seen.update(p=prompt), grounded_judge(prompt))[1]
    with f:
        added.check_added(REF, final_with(FX["restatements"][1]), FX["notes"], "claude:sonnet", "claude:sonnet")
    material = seen["p"].split("Reference material:\n", 1)[1]
    assert material.startswith("Evidence passages most relevant")
    assert "N = 692" in evidence_block(seen["p"]) and "pre-registered replication" in evidence_block(seen["p"])
    assert material.index("Evidence passages") < material.index("Reference section:") < material.index("Source notes:")
    assert "A restatement counts" in seen["p"] and "evidence passages first" in seen["p"]


def test_relevant_evidence_is_bounded_and_empty_when_nothing_bears_on_the_claim():
    assert added.relevant_evidence(["Zebras migrate across Antarctica."], FX["notes"]) == ""
    big = "- [supported] Claim about widgets (passages: " + "widget " * 5000 + ")"
    ev = added.relevant_evidence(["Widgets are widgets"] * 30, "\n\n".join([big] * 40))
    assert len(ev) <= added.MAX_EVIDENCE_CHARS + 20 * 4


def test_source_excerpt_reaches_the_judge_for_a_fact_only_the_transcript_has():
    ev = added.relevant_evidence([next(x for x in FX["inferences"] if "$100" in x)], FX["notes"])
    assert "$100 or $1,000" in ev


def test_numbers_entities_negation_and_hedges_stay_deterministic():
    """The deterministic half in write_pipeline.addcheck never relaxes for restatements: a changed number or a new hedge still fails before any model call."""
    from scripts.write_pipeline import addcheck as AC
    ev = {"claims": [{"id": "c1", "claim": "692 participants", "status": "supported", "supported_wording": "A replication ran 692 participants.", "evidence": [{"passage": "N = 692"}]}]}
    support = AC.support_sentences(ev, "A replication ran 692 participants and found the bias held.")
    bad = AC.check_sentence("A replication ran 962 participants.", ev=ev, support=support, known_urls=set(), blob_numbers=__import__("scripts.write_pipeline.mdlib", fromlist=["x"]).significant_numbers("692"), author_material=False)
    assert any("962" in r for r in bad)
