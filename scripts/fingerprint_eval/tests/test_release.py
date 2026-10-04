"""Release authorization: real authz/record/ledger/release code paths, only models and the evaluator identity are stubbed."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.fingerprint_eval import authz, added, ledger, record as R, release
from scripts.fingerprint_eval.contracts import (QUARANTINE, RELEASE_ACTIVE, RELEASE_ARTICLE, RELEASE_AUTH, RUNS_DIR, Category, EvaluatorVersion,
                                                LedgerState, Result)
from scripts.fingerprint_eval.tests.fakes import ARTICLE, Fakes

LINKED = ARTICLE.replace("Nobody disputed that figure.", "See [the report](http://x.example/r) for details of that figure.")


class Base(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.root = Path(self._td.name)
        self.ev = {"v": EvaluatorVersion("a" * 40, "t" * 64, False)}
        self.repo = self.root / "repo"
        self.corpus = self.repo / "data/fingerprint-eval/author-corpus"
        self.corpus.mkdir(parents=True)
        (self.corpus / "2021-01-01_a.txt").write_text("word " * 200)
        (self.corpus / "MANIFEST.json").write_text(json.dumps({"cutoff": "2023-01-01", "source": "test", "files": []}))
        for p in (mock.patch.object(authz, "evaluator_version", lambda: self.ev["v"]), mock.patch.object(authz, "REPO", self.repo),
                  mock.patch.object(release, "_load_heal", lambda: None),
                  mock.patch.dict("os.environ", {"FINGERPRINT_EVAL_WORKSPACE": str(self.root / "ws")})):
            p.start()
            self.addCleanup(p.stop)
        self.fakes = Fakes().__enter__()
        self.addCleanup(self.fakes.__exit__)
        self.pkg = self.make_pkg("alpha", ARTICLE + "\n")

    def make_pkg(self, slug, final, ref=ARTICLE):
        d = self.root / "articles" / slug
        d.mkdir(parents=True)
        (d / "version.json").write_text(json.dumps({"slug": slug, "articleFile": "article-v1.md"}))
        (d / "article-v1.md").write_text(ref)
        (d / "article-medium.md").write_text(final)
        return d

    def calls(self):
        return sum(self.fakes.calls.values())

    def authorize(self, pkg=None):
        return release.authorize(pkg or self.pkg, out=lambda *a: None)

    def verify(self, pkg=None):
        return release.verify_package(pkg or self.pkg)[0]


class Authorization(Base):
    def test_valid_pass_writes_release_and_verifies(self):
        self.assertEqual(self.authorize(), 0)
        self.assertEqual((self.pkg / RELEASE_ARTICLE).read_bytes(), (self.pkg / "article-medium.md").read_bytes())
        auth = json.loads((self.pkg / RELEASE_AUTH).read_text())
        self.assertEqual(set(auth), {"binding", "record_path", "authorized_at_utc", "release_article_sha256"})
        self.assertTrue((self.root / "ws" / RELEASE_ACTIVE).is_file())
        self.assertTrue((self.pkg / "evals/fingerprint-gate/SUMMARY.md").read_text().startswith("Fingerprint / integrity gate: PASS"))
        self.assertIn(LedgerState.PUBLISH_AUTHORIZED, [e.state for e in ledger.read(self.pkg)])
        self.assertTrue(self.verify())

    def test_one_byte_change_fails_verify_and_authorize_reevaluates(self):
        self.authorize()
        before = self.calls()
        (self.pkg / "article-medium.md").write_text(ARTICLE + "\n\n")
        self.assertFalse(self.verify())
        self.assertEqual(self.authorize(), 0)
        self.assertGreater(self.calls(), before)  # cache miss: new bytes, full gate run
        self.assertTrue(self.verify())

    def test_evaluator_change_fails_verify(self):
        self.authorize()
        self.ev["v"] = EvaluatorVersion("b" * 40, "t" * 64, False)
        ok, why = release.verify_package(self.pkg)
        self.assertFalse(ok)
        self.assertIn("evaluator_id", why)

    def test_corpus_change_fails_verify(self):
        self.authorize()
        (self.corpus / "2021-01-01_a.txt").write_text("word " * 201)
        ok, why = release.verify_package(self.pkg)
        self.assertFalse(ok)
        self.assertIn("author_corpus_sha256", why)

    def test_missing_authorization_fails(self):
        self.authorize()
        (self.pkg / RELEASE_AUTH).unlink()
        self.assertFalse(self.verify())

    def test_missing_release_article_fails(self):
        self.authorize()
        (self.pkg / RELEASE_ARTICLE).unlink()
        self.assertFalse(self.verify())

    def test_authorization_for_another_hash_fails(self):
        self.authorize()
        other = self.make_pkg("beta", ARTICLE.replace("forty", "forty") + "\n\n")
        shutil.copytree(self.pkg / "release", other / "release")
        self.assertFalse(self.verify(other))

    def test_non_pass_record_never_verifies(self):
        self.authorize()
        p = next((self.pkg / RUNS_DIR).glob("*.json"))
        d = json.loads(p.read_text())
        d["result"], d["category"] = "FAIL", "MISSING_LINK"
        p.chmod(0o644)
        p.write_text(json.dumps(d))
        self.assertFalse(self.verify())

    def test_dirty_evaluator_is_blocked(self):
        self.ev["v"] = EvaluatorVersion("a" * 40, "t" * 64, True)
        self.assertEqual(self.authorize(), 4)
        self.assertFalse((self.pkg / RELEASE_ARTICLE).exists())
        self.assertFalse((self.pkg / RELEASE_AUTH).exists())
        self.assertFalse(self.verify())
        self.assertEqual(json.loads((self.pkg / QUARANTINE).read_text())["category"], "DEPENDENCY_FAILURE")


class CostControl(Base):
    def test_identical_reference_makes_zero_model_calls(self):
        pkg = self.make_pkg("same", ARTICLE)
        ctx = authz.resolve_package(pkg)
        rec = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual(self.calls(), 0)
        self.assertEqual(rec.result, Result.PASS)
        self.assertTrue(rec.reference_identical)
        self.assertEqual(rec.claims["judged_by"], "identity")

    def test_deterministic_fail_makes_zero_model_calls(self):
        pkg = self.make_pkg("nolink", ARTICLE, ref=LINKED)
        self.assertEqual(self.authorize(pkg), 3)
        self.assertEqual(self.calls(), 0)
        rec = R.list_records(pkg)[-1][1]
        self.assertEqual((rec.result, rec.category), (Result.FAIL, Category.MISSING_LINK))
        self.assertFalse((pkg / RELEASE_ARTICLE).exists())
        q = json.loads((pkg / QUARANTINE).read_text())
        self.assertEqual(set(q), {"category", "kind", "retryable", "created_at_utc", "content_sha256", "evaluator_id", "cycles", "artifacts"})
        self.assertEqual((q["category"], q["kind"], q["retryable"]), ("MISSING_LINK", "content", False))

    def test_cache_hit_makes_zero_model_calls(self):
        ctx = authz.resolve_package(self.pkg)
        first = authz.evaluate_package(ctx, ctx.final_path)
        n = self.calls()
        self.assertGreater(n, 0)
        second = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual(self.calls(), n)
        self.assertTrue(second.cache_hit and not first.cache_hit)
        self.assertEqual(len(list((self.pkg / RUNS_DIR).glob("*.json"))), 1)  # records are written once

    def test_evaluator_change_misses_cache(self):
        ctx = authz.resolve_package(self.pkg)
        authz.evaluate_package(ctx, ctx.final_path)
        n = self.calls()
        self.ev["v"] = EvaluatorVersion("c" * 40, "t" * 64, False)
        self.assertFalse(authz.evaluate_package(ctx, ctx.final_path).cache_hit)
        self.assertGreater(self.calls(), n)


class Errors(Base):
    def test_missing_reference_is_missing_source(self):
        (self.pkg / "article-v1.md").unlink()
        ctx = authz.resolve_package(self.pkg)
        self.assertIsNone(ctx.reference_path)
        rec = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual(rec.category, Category.MISSING_SOURCE)
        self.assertEqual(self.authorize(), 3)

    def test_model_error_is_error_record_with_category_never_raises(self):
        class Boom(Exception):
            category = Category.GATEWAY_FAILURE
        self.fakes.judge_reply = lambda p: (_ for _ in ()).throw(RuntimeError("x"))
        ctx = authz.resolve_package(self.pkg)
        rec = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual(rec.result, Result.ERROR)
        self.assertEqual(rec.category, Category.UNKNOWN_ERROR)  # no category attribute on the error yet
        self.assertFalse(authz.evaluate_package(ctx, ctx.final_path).cache_hit)  # ERROR is never cached
        self.assertEqual(self.authorize(), 4)

    def test_record_schema_rejects_tampering(self):
        ctx = authz.resolve_package(self.pkg)
        authz.evaluate_package(ctx, ctx.final_path)
        p, rec = R.list_records(self.pkg)[0]
        d = R.to_dict(rec)
        for mut in (lambda x: x.pop("binding"), lambda x: x.update(result="MAYBE"), lambda x: x.update(result="PASS", category="MISSING_LINK"),
                    lambda x: x["binding"].update(content_sha256="zz")):
            bad = json.loads(json.dumps(d))
            mut(bad)
            with self.assertRaises(R.RecordError):
                R.from_dict(bad)
        with self.assertRaises(FileExistsError):
            R.write_record(self.pkg, rec)  # immutable


class AddedClaims(Base):
    def setUp(self):
        super().setUp()
        real = self.fakes.judge_reply
        self.verdict = "unsupported"
        self.fakes.judge_reply = lambda p: (json.dumps([{"i": 1, "verdict": self.verdict, "reason": "r"}]) if "Reference material:" in p else real(p))

    def test_no_new_sentences_means_no_extra_calls(self):
        self.assertEqual(added.new_sentences(ARTICLE, ARTICLE + "\n"), {})

    def test_unsupported_inserted_claim_fails(self):
        final = ARTICLE.replace("Nobody disputed that figure.", "Nobody disputed that figure. Aliens secretly built the reactor in 1950.")
        pkg = self.make_pkg("ins", final)
        ctx = authz.resolve_package(pkg)
        rec = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual((rec.result, rec.category), (Result.FAIL, Category.ADDED_UNSUPPORTED_CLAIM))
        self.assertEqual(rec.claims["added_unsupported"], 1)

    def test_supported_inserted_claim_passes(self):
        self.verdict = "supported"
        final = ARTICLE.replace("Nobody disputed that figure.", "Nobody disputed that figure. Shipping delays caused the overrun.")
        pkg = self.make_pkg("ok", final)
        ctx = authz.resolve_package(pkg)
        self.assertEqual(authz.evaluate_package(ctx, ctx.final_path).result, Result.PASS)


class Status(Base):
    def states(self):
        return release.status(self.pkg)["states"]

    def test_five_states_from_files(self):
        s = self.states()
        self.assertFalse(any(s.values()))
        ctx = authz.resolve_package(self.pkg)
        authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual(self.states(), {"requested": True, "executed": True, "valid": True, "matches_content": True, "authorized": False})
        self.ev["v"] = EvaluatorVersion("d" * 40, "t" * 64, False)
        s = self.states()
        self.assertTrue(s["executed"] and s["valid"])
        self.assertFalse(s["matches_content"])
        self.ev["v"] = EvaluatorVersion("a" * 40, "t" * 64, False)
        self.authorize()
        self.assertTrue(all(self.states().values()))
        (self.pkg / "article-medium.md").write_text(ARTICLE + "\n\n\n")
        s = self.states()
        self.assertFalse(any(s.values()))  # nothing was requested/executed for the new bytes
        (self.pkg / "article-medium.md").write_text(ARTICLE + "\n")
        (self.pkg / RELEASE_AUTH).unlink()
        s = self.states()
        self.assertTrue(s["requested"] and s["executed"] and s["valid"] and s["matches_content"])
        self.assertFalse(s["authorized"])


class Resolver(Base):
    def test_rules(self):
        ctx = authz.resolve_package(self.pkg)
        self.assertEqual((ctx.final_rule, ctx.reference_path.name), ("article-medium.md", "article-v1.md"))
        (self.pkg / "article-healed-1.md").write_text("x")
        vj = json.loads((self.pkg / "version.json").read_text())
        vj["finalFile"] = "article-healed-1.md"
        (self.pkg / "version.json").write_text(json.dumps(vj))
        self.assertEqual(authz.resolve_package(self.pkg).final_rule, "version.json.finalFile")
        (self.pkg / "article-medium.md").unlink()
        (self.pkg / "version.json").write_text(json.dumps({"articleFile": "article-v1.md"}))
        self.assertEqual(authz.resolve_package(self.pkg).final_rule, "version.json.articleFile")
        vj["finalFile"] = "../escape.md"
        (self.pkg / "version.json").write_text(json.dumps(vj))
        with self.assertRaises(authz.PackageError):
            authz.resolve_package(self.pkg)

    def test_prepublish_binding_selects_reference_and_checks_hash(self):
        (self.pkg / "article-v2.md").write_text(ARTICLE)
        (self.pkg / "evals").mkdir()
        (self.pkg / "evals/prepublish-v1.json").write_text(json.dumps({"articleFile": "article-v1.md"}))
        (self.pkg / "evals/prepublish-v2.json").write_text(json.dumps({"articleFile": "article-v2.md", "sha256": authz.sha256_file(self.pkg / "article-v2.md")}))
        self.assertEqual(authz.resolve_package(self.pkg).reference_path.name, "article-v2.md")
        (self.pkg / "article-v2.md").write_text(ARTICLE + "drift")
        self.assertIsNone(authz.resolve_package(self.pkg).reference_path)


if __name__ == "__main__":
    unittest.main()
