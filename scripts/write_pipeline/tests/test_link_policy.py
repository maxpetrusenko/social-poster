"""Link-preservation policy: URL identity, declared removals only when the claims are gone and nothing depends on the URL."""
import json
from collections import Counter

from scripts.fingerprint_eval import record as R
from scripts.fingerprint_eval.guards import structure_preservation
from scripts.write_pipeline import editguard as G
from scripts.write_pipeline import linkpolicy as LP

from .fakes import Runner
from .test_repair_adds import candidate, major_open, try_repair

BIAS = "https://sive.rs/book/ThinkingInBets"
OTHER = "https://example.com/other-source"
S_BIAS = f"People credit wins to skill because of [self-serving bias]({BIAS}) in how they remember outcomes."
S_OTHER = f"The panel measured forty decisions in [the field study]({OTHER}) across three firms."
S_PLAIN = "Founders keep telling the same story about luck and skill."
REF = f"# T\n\n{S_BIAS} {S_OTHER}\n\n{S_PLAIN}\n"
EV = {"claims": [{"id": "c1", "claim": "The panel measured forty decisions across three firms", "status": "supported", "evidence": [{"url": OTHER}]},
                 {"id": "c2", "claim": "People credit wins to skill because of self-serving bias", "status": "supported", "evidence": [{"url": BIAS}]}]}
EV_NO_BIAS_CLAIM = {"claims": [EV["claims"][0]]}


def guard(cand, removals=None, ev=EV, ref=REF):
    return G.edit_guard(ref, cand, known_urls={BIAS, OTHER}, blob_numbers=Counter(), strict=False, removals=removals, ev=ev)


def test_anchor_only_change_with_the_same_url_is_not_a_lost_link():
    cand = REF.replace("[self-serving bias]", "[a self-serving memory bias]")
    g = guard(cand)
    assert g["ok"], g["reasons"]
    s = structure_preservation(REF, cand)  # the evaluator gate reads the same identity
    assert s["links"]["preserved"] and not s["all_preserved"] is False


def test_declared_removal_of_a_sentence_and_its_link_without_dependents_passes():
    cand = REF.replace(S_BIAS + " ", "")
    g = guard(cand, removals=[{"text": S_BIAS, "reason": "overclaim"}], ev=EV_NO_BIAS_CLAIM)
    assert g["ok"], g["reasons"]
    assert g["removed_urls"] == [BIAS] and len(g["removed_sentences"]) == 1


def test_declared_removal_is_rejected_while_a_remaining_ledger_claim_cites_the_url():
    remaining = "Founders credit wins to skill because of self-serving bias, a pattern that repeats in most memories."
    cand = REF.replace(S_BIAS + " ", "").replace(S_PLAIN, remaining)
    g = guard(cand, removals=[{"text": S_BIAS, "reason": "overclaim"}])
    assert not g["ok"] and "MISSING_LINK" in g["categories"]
    assert any("cites it in the research ledger" in r for r in g["reasons"])


def test_undeclared_removal_fails():
    g = guard(REF.replace(S_BIAS + " ", ""), ev=EV_NO_BIAS_CLAIM)
    assert not g["ok"] and any("without a declared removal" in r for r in g["reasons"])
    assert not structure_preservation(REF, REF.replace(S_BIAS + " ", ""))["links"]["preserved"]


def test_changed_url_fails_even_with_the_anchor_kept():
    g = guard(REF.replace(BIAS, "https://sive.rs/book/Other"), ev=EV_NO_BIAS_CLAIM)
    assert not g["ok"] and any("without a declared removal" in r or "not backed" in r for r in g["reasons"])
    assert not structure_preservation(REF, REF.replace(BIAS, "https://sive.rs/book/Other"))["links"]["preserved"]


def test_removal_that_leaves_no_source_link_fails():
    ref = f"# T\n\n{S_BIAS}\n\n{S_PLAIN}\n"
    g = guard(ref.replace(S_BIAS + "\n\n", ""), removals=[{"text": S_BIAS, "reason": "x"}], ev=EV_NO_BIAS_CLAIM, ref=ref)
    assert not g["ok"] and any("no source link would remain" in r for r in g["reasons"])


def test_a_declaration_that_does_not_match_a_reference_sentence_allows_nothing():
    g = guard(REF.replace(S_BIAS + " ", ""), removals=[{"text": "A sentence that is not in the text.", "reason": "x"}], ev=EV_NO_BIAS_CLAIM)
    assert not g["ok"]


def test_allowlist_on_the_evaluator_structure_check_is_explicit():
    cand = REF.replace(S_BIAS + " ", "")
    assert structure_preservation(REF, cand, allowed_link_removals={BIAS})["links"]["preserved"]
    assert not structure_preservation(REF, cand, allowed_link_removals={OTHER})["links"]["preserved"]


def test_claims_gone_check_rejects_a_paraphrase_elsewhere(tmp_path):
    cand = REF.replace(S_BIAS + " ", "") + "\nAnother paragraph says wins come from skill because memory flatters the self.\n"
    g = guard(cand, removals=[{"text": S_BIAS, "reason": "x"}], ev=EV_NO_BIAS_CLAIM)
    assert g["ok"]
    r = Runner()
    r.removed_paraphrases = ["memory flatters the self"]
    reasons, blocked = G.confirm_link_removals(g, r, tmp_path, cand, tmp_path / "w" / "removed")
    assert reasons and "paraphrased elsewhere" in reasons[0] and not blocked
    reasons, blocked = G.confirm_link_removals(g, Runner(), tmp_path, cand.replace("memory flatters the self", "x"), tmp_path / "w2" / "removed")
    assert reasons == [] and not blocked
    reasons, blocked = G.confirm_link_removals(g, lambda argv: (2, "GATE ERROR"), tmp_path, cand, tmp_path / "w3" / "removed")
    assert blocked and reasons


# ---- pipeline level -------------------------------------------------------------------------------------------------
def test_repair_rejects_removing_the_only_source_link_and_accepts_anchor_only_rewording(d):
    major_open(d)
    cand = candidate(d)
    para = next(p for p in cand.split("\n\n") if "[test report]" in p)
    sent = para.split(". ")[0] + "."
    rc, out = try_repair(d, cand.replace(sent, "").replace("  ", " "), removals=[{"text": sent, "reason": "overclaim"}])
    assert rc == 1 and any("link" in r for r in out["reasons"])  # every ledger claim cites it, and it would be the last source link
    rc, out = try_repair(d, cand.replace("[test report](", "[lab report](").replace("] (", "]("))
    assert rc == 0 and out["code"] == "ACCEPTED", out


def test_final_integrity_honors_the_signed_ledger_and_rejects_a_forged_one(d):
    cut = "The report covers one workload on one fleet."
    major_open(d)
    d.runner.required = ["covers one workload on one fleet"]
    rc, out = try_repair(d, candidate(d).replace(cut + " ", ""), removals=[{"text": cut, "reason": "restates the next paragraph"}])
    assert rc == 0, out
    d.critic.replies = [{"verdict": "pass", "findings": []}]
    d.cli("run", "critic")
    d.cli("repair", "done")
    assert d.cli("fpverify", "done")[0] == 0
    rc, out = d.cli("run", "integrity")
    assert rc == 0, out
    led = d.pkg / "write-pipeline/removals-ledger.json"
    good = led.read_text()
    forged = json.loads(good)
    forged["entries"].append({"sentence": "[test report](https://example.com/lab-report) is wrong.", "stage": "repair", "reason": "x"})
    led.write_text(json.dumps(forged))  # edited without the record key: signature breaks
    rc, out = d.cli("run", "integrity")
    assert rc != 0 and any("removals ledger rejected" in r or "signature" in r for r in out["reasons"]), out
    unsigned = json.loads(good)
    unsigned.pop(R.SIG_FIELD)
    led.write_text(json.dumps(unsigned))
    rc, out = d.cli("run", "integrity")
    assert rc != 0 and any("unsigned" in r for r in out["reasons"]), out
    led.write_text(good)
    assert d.cli("run", "integrity")[0] == 0
