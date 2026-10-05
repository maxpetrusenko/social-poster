"""Codex round-4 core findings: sentence-side coverage (reference and added), short additions, watchdog binding."""
import json
from types import SimpleNamespace as NS

import pytest

from scripts.fingerprint_eval import added, authz, extract_cache, rewrite, watchdog
from scripts.fingerprint_eval import record as R
from scripts.fingerprint_eval.contracts import Category, Result
from scripts.fingerprint_eval.gateway import GatewayError
from scripts.fingerprint_eval.tests.fakes import ARTICLE
from scripts.fingerprint_eval.tests.test_release import Base


def evaluate(base, name, final):
    pkg = base.make_pkg(name, final)
    ctx = authz.resolve_package(pkg)
    return authz.evaluate_package(ctx, ctx.final_path)


class R4Coverage(Base):
    def test_sentence_side_coverage_unit(self):
        long = "Shipping delays caused the overrun across three harbours."
        self.assertFalse(added.sentence_covered(long, ["Shipping"]))  # one token cannot cover a long sentence
        self.assertTrue(added.sentence_covered(long, ["Shipping delays caused the overrun"]))
        self.assertTrue(added.sentence_covered(long, ["Whales sing"], tagged=True))
        self.assertEqual(len(added.uncovered_sentences([long], ["Shipping"])), 1)
        self.assertEqual(added.uncovered_sentences([long], ["Whales sing"], {1}), [])

    def test_one_token_claim_does_not_cover_long_added_sentence(self):
        final = ARTICLE.replace("Nobody disputed that figure.", "Nobody disputed that figure. Shipping delays caused the overrun across three harbours.")
        self.fakes.extract_reply = lambda p, real=self.fakes.extract_reply: json.dumps({"role": "r", "propositions": [{"claim": "Shipping", "links": []}]}) if "harbours" in p else real(p)
        rec = evaluate(self, "one-token", final)
        self.assertEqual((rec.result, rec.category), (Result.ERROR, Category.MALFORMED_MODEL_OUTPUT))
        self.assertIn("without a claim", rec.reasons[0])

    def test_short_added_sentence_is_checked_and_unsupported_fails(self):
        rec = evaluate(self, "they-won", ARTICLE.replace("Nobody disputed that figure.", "Nobody disputed that figure. They won."))
        self.assertEqual((rec.result, rec.category), (Result.FAIL, Category.ADDED_UNSUPPORTED_CLAIM))

    def test_reference_gap_unrepaired_is_error_after_one_reextraction(self):
        real = self.fakes.extract_reply
        self.fakes.extract_reply = lambda p: json.dumps({"role": "r", "propositions": [{"claim": "Whales sing complex songs.", "links": []}]}) if "budget" in p else real(p)
        rec = evaluate(self, "refgap", ARTICLE.replace("Nobody disputed", "Nobody questioned"))
        self.assertEqual((rec.result, rec.category), (Result.ERROR, Category.MALFORMED_MODEL_OUTPUT))
        self.assertIn("after re-extraction", " ".join(rec.reasons))

    def test_reference_gap_repaired_by_targeted_reextraction(self):
        real = self.fakes.extract_reply
        state = {"first": True}

        def reply(p):
            d = json.loads(real(p))
            if "budget" in p and state["first"]:
                state["first"] = False
                d["propositions"] = d["propositions"][:1]  # first call drops the rest of the segment
            return json.dumps(d)
        self.fakes.extract_reply = reply
        rec = evaluate(self, "refrepair", ARTICLE.replace("Nobody disputed", "Nobody questioned"))
        self.assertFalse(state["first"])
        self.assertNotIn("after re-extraction", " ".join(rec.reasons))
        self.assertNotEqual(rec.category, Category.MALFORMED_MODEL_OUTPUT)

    def test_sentence_ids_validated_strictly(self):
        ok = {"role": "r", "propositions": [{"claim": "A b c.", "sentence_ids": [1]}]}
        self.assertEqual(rewrite.parse_extraction(ok, 1)[1][0]["sentence_ids"], [1])
        for bad in ([0], [2], [True], ["1"], 1):
            with self.assertRaises(GatewayError):
                rewrite.parse_extraction({"role": "r", "propositions": [{"claim": "A b c.", "sentence_ids": bad}]}, 1)

    def test_cache_schema_bumped(self):
        self.assertGreaterEqual(extract_cache.SCHEMA_VERSION, 3)


def test_watchdog_rejects_record_binding_mismatch(tmp_path, monkeypatch):
    (tmp_path / "release").mkdir()
    (tmp_path / "release" / "medium-final.md").write_text("x")
    (tmp_path / "release" / "authorization.json").write_text("{}")
    h = watchdog.sha256_file(tmp_path / "release" / "medium-final.md")
    auth = NS(release_article_sha256=h, binding=NS(content_sha256=h, tag="a"), record_path="r")
    rec = NS(result=NS(value="PASS"), binding=NS(content_sha256=h, tag="b"))
    monkeypatch.setattr(R, "load_authorization", lambda p: auth)
    monkeypatch.setattr(R, "load_record_in", lambda p, rp: rec)
    monkeypatch.setattr(R, "check_raw_report", lambda p, r: None)
    ok, why = watchdog.check_authorization(tmp_path)
    assert not ok and "binding" in why
    rec.binding = auth.binding
    assert watchdog.check_authorization(tmp_path) == (True, "ok")
