"""Release authorization: real authz/record/ledger/release code paths, only models and the evaluator identity are stubbed."""
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.fingerprint_eval import authz, added, ledger, record as R, release
from scripts.fingerprint_eval.contracts import (QUARANTINE, RELEASE_ACTIVE, RELEASE_ARTICLE, RELEASE_AUTH, RUNS_DIR, Category, EvaluatorVersion,
                                                LedgerState, Result)
from scripts.fingerprint_eval.tests.fakes import ARTICLE, ARTICLE_REORDERED, Fakes

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
        self.pkg = self.make_pkg("alpha", ARTICLE_REORDERED + "\n")  # not identical to the reference: the judge really runs

    def make_pkg(self, slug, final, ref=ARTICLE, bound=False, bound_sha=None):
        """bound: also write the prepublish rating record naming article-v1.md with its recorded sha256 (bound_sha overrides it)."""
        d = self.root / "articles" / slug
        d.mkdir(parents=True)
        (d / "version.json").write_text(json.dumps({"slug": slug, "articleFile": "article-v1.md"}))
        (d / "article-v1.md").write_text(ref)
        if bound:
            (d / "evals").mkdir()
            (d / "evals/prepublish-v1.json").write_text(json.dumps({"articleFile": "article-v1.md", "articleSha256": bound_sha or hashlib.sha256(ref.encode()).hexdigest()}))
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
        self.assertEqual(set(auth), {"binding", "record_path", "authorized_at_utc", "release_article_sha256", "hmac_sha256"})
        self.assertTrue((self.root / "ws" / RELEASE_ACTIVE).is_file())
        self.assertTrue((self.pkg / "evals/fingerprint-gate/SUMMARY.md").read_text().startswith("Fingerprint / integrity gate: PASS"))
        self.assertIn(LedgerState.PUBLISH_AUTHORIZED, [e.state for e in ledger.read(self.pkg)])
        self.assertTrue(self.verify())

    def test_one_byte_change_fails_verify_and_authorize_reevaluates(self):
        self.authorize()
        before = self.calls()
        (self.pkg / "article-medium.md").write_text(ARTICLE_REORDERED + "\n\n")
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
        pkg = self.make_pkg("same", ARTICLE, bound=True)
        ctx = authz.resolve_package(pkg)
        rec = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual(self.calls(), 0)
        self.assertEqual(rec.result, Result.PASS)
        self.assertTrue(rec.reference_identical)
        self.assertEqual(rec.claims["judged_by"], "identity")
        self.assertEqual(rec.claims["reference_bound_by"], "evals/prepublish-v1.json")

    def test_identity_shortcut_needs_a_hash_bound_rating(self):
        """Regression: byte-identical to a reference that is NOT the rated, hash-bound version runs every check."""
        for name, kw in (("norating", {}), ("stalehash", {"bound": True, "bound_sha": "0" * 64})):
            pkg = self.make_pkg(name, ARTICLE, **kw)
            ctx = authz.resolve_package(pkg)
            before = self.calls()
            if name == "stalehash":
                self.assertIsNone(ctx.reference_path)  # the rating no longer applies: no reference at all
                continue
            self.assertIsNone(authz.reference_binding(pkg, ctx.reference_path))
            rec = authz.evaluate_package(ctx, ctx.final_path)
            self.assertGreater(self.calls(), before, name)
            self.assertNotEqual(rec.claims["judged_by"], "identity")
            self.assertNotIn("reference_bound_by", rec.claims)

    def test_identity_pass_without_binding_is_rejected_by_the_record_schema(self):
        pkg = self.make_pkg("same", ARTICLE, bound=True)
        ctx = authz.resolve_package(pkg)
        d = R.to_dict(authz.evaluate_package(ctx, ctx.final_path))
        d["claims"].pop("reference_bound_by")
        with self.assertRaises(R.RecordError):
            R.from_dict(d)

    def test_partial_evaluation_is_labelled_and_can_never_authorize(self):
        pkg = self.make_pkg("nolink", ARTICLE, ref=LINKED)
        self.assertEqual(self.authorize(pkg), 3)
        path, rec = R.list_records(pkg)[-1]
        self.assertEqual(rec.result, Result.FAIL)
        self.assertEqual(rec.structure["evaluated"], "partial")
        self.assertEqual(rec.structure["checks_skipped"], ["claims", "semantic"])
        raw = json.loads((pkg / rec.raw_report_path).read_text())
        self.assertEqual((raw["evaluated"], raw["checks_skipped"], raw["exit_code"]), ("partial", ["claims", "semantic"], 1))
        d = R.to_dict(rec)
        d["result"], d["category"] = "PASS", "PASS"
        with self.assertRaises(R.RecordError):  # a forged PASS over a partial evaluation does not load, so verify cannot accept it
            R.from_dict(d)
        self.assertFalse(self.verify(pkg))

    def test_deterministic_fail_makes_zero_model_calls(self):
        pkg = self.make_pkg("nolink", ARTICLE, ref=LINKED)
        self.assertEqual(self.authorize(pkg), 3)
        self.assertEqual(self.calls(), 0)
        rec = R.list_records(pkg)[-1][1]
        self.assertEqual((rec.result, rec.category), (Result.FAIL, Category.MISSING_LINK))
        self.assertFalse((pkg / RELEASE_ARTICLE).exists())
        q = json.loads((pkg / QUARANTINE).read_text())
        self.assertEqual(set(q), {"status", "category", "kind", "retryable", "created_at_utc", "content_sha256", "evaluator_id", "cycles", "artifacts"})
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
        (self.pkg / "article-medium.md").write_text(ARTICLE_REORDERED + "\n\n\n")
        s = self.states()
        self.assertFalse(any(s.values()))  # nothing was requested/executed for the new bytes
        (self.pkg / "article-medium.md").write_text(ARTICLE_REORDERED + "\n")
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


def test_cache_key_includes_source_notes_and_models(tmp_path, monkeypatch):
    from scripts.fingerprint_eval import authz
    from scripts.fingerprint_eval.contracts import PackageCtx
    notes = tmp_path / "notes.md"
    notes.write_text("a")
    ctx = PackageCtx(package=tmp_path, slug="s", final_path=tmp_path / "f.md", final_rule="x", reference_path=None, source_notes=notes)
    k1 = authz._cache_extra(ctx)
    notes.write_text("b")
    assert authz._cache_extra(ctx) != k1
    monkeypatch.setitem(authz.MODELS, "judge", "qwen3:8b")
    assert authz._cache_extra(ctx)["judge"] == "qwen3:8b"


def test_cache_key_binds_gateway_embedding_threshold_and_prompts(tmp_path, monkeypatch):
    from scripts.fingerprint_eval import authz, added, gateway, judge, rewrite
    from scripts.fingerprint_eval.contracts import PackageCtx
    ctx = PackageCtx(package=tmp_path, slug="s", final_path=tmp_path / "f.md", final_rule="x", reference_path=None, source_notes=None)

    def ident(digest):
        monkeypatch.setattr(authz, "_embed_identity", lambda ep: {"name": authz.EMBED_MODEL, "endpoint": ep, "digest": digest})

    ident("d1")
    base = authz._cache_extra(ctx)
    assert base["gateway"]["endpoint"] == gateway.BASE_URL and base["threshold"] == authz.THRESHOLD
    assert base["embedding"]["digest"] == "d1" and base["models"]["judge"]["version"]
    ident("d2")
    assert authz._cache_extra(ctx) != base  # embedding digest changed
    ident("d1")
    assert authz._cache_extra(ctx) == base
    for mod, attr, val in ((gateway, "BASE_URL", "https://other.example/v1"), (authz, "THRESHOLD", 0.95),
                           (judge, "JUDGE_PROMPT", judge.JUDGE_PROMPT + " tweak"), (judge, "JUDGE_BATCH", judge.JUDGE_BATCH + 1), (added, "SUPPORT_PROMPT", added.SUPPORT_PROMPT + " tweak"),
                           (rewrite, "EXTRACT_PROMPT", rewrite.EXTRACT_PROMPT + " tweak")):
        with monkeypatch.context() as m:
            m.setattr(mod, attr, val)
            m.setattr(authz, "_embed_identity", lambda ep: {"name": authz.EMBED_MODEL, "endpoint": ep, "digest": "d1"})
            assert authz._cache_extra(ctx) != base, attr


def test_embed_identity_without_key_is_name_plus_endpoint(monkeypatch):
    from scripts.fingerprint_eval import authz
    monkeypatch.delenv("LLM_GATEWAY_API_KEY", raising=False)
    monkeypatch.setattr(authz, "_EMBED_ID", {})
    assert authz._embed_identity("https://x/v1") == {"name": authz.EMBED_MODEL, "endpoint": "https://x/v1", "digest": None}


def test_resolve_package_rejects_symlink_escapes(tmp_path):
    import pytest
    from scripts.fingerprint_eval import authz
    outside = tmp_path / "outside.md"
    outside.write_text("secret")
    pkg = tmp_path / "pkg"
    (pkg / "sources").mkdir(parents=True)
    (pkg / "article-medium.md").symlink_to(outside)
    with pytest.raises(authz.PackageError, match="escapes"):
        authz.resolve_package(pkg)
    (pkg / "article-medium.md").unlink()
    (pkg / "article-medium.md").write_text("ok")
    (pkg / "sources" / "source-notes.md").symlink_to(outside)
    with pytest.raises(authz.PackageError, match="escapes"):
        authz.resolve_package(pkg)
