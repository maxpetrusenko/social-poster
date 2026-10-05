"""Codex round-3 BLOCKING findings: forged PASS state, evaluator/reference binding, claim coverage, child env, max_cycles."""
import hashlib
import json
import os
import stat
import subprocess
from pathlib import Path
from unittest import mock

import pytest

from scripts.fingerprint_eval import added, authz, gate as G, heal, nightly, record as R, release, watchdog
from scripts.fingerprint_eval.contracts import (MAX_REPAIR_CYCLES, RELEASE_AUTH, RUNS_DIR, Category, EvaluatorVersion, Result, clamp_cycles)
from scripts.fingerprint_eval.errors import EvaluationError
from scripts.fingerprint_eval.tests.fakes import ARTICLE, Fakes
from scripts.fingerprint_eval.tests.test_release import Base


def rewrite(path: Path, fn, resign: bool = False):
    d = json.loads(path.read_text())
    fn(d)
    if resign:
        d = R.signed(d)
    path.chmod(0o644)
    path.write_text(json.dumps(d))


class Forgery(Base):
    def setUp(self):
        super().setUp()
        self.assertEqual(self.authorize(), 0)
        self.rec_path = next((self.pkg / RUNS_DIR).glob("*.json"))
        self.assertTrue(self.verify())

    def reason(self):
        ok, why = release.verify_package(self.pkg)
        self.assertFalse(ok, why)
        return why

    def test_unsigned_record_rejected(self):
        rewrite(self.rec_path, lambda d: d.pop(R.SIG_FIELD))
        self.assertIn("unsigned", self.reason())

    def test_edited_record_rejected(self):
        rewrite(self.rec_path, lambda d: d.update(runtime_s=999.0))
        self.assertIn("signature invalid", self.reason())

    def test_record_signed_with_another_key_rejected(self):
        other = Path(os.environ["FINGERPRINT_EVAL_KEY_FILE"]).parent / "other.key"
        with mock.patch.dict(os.environ, {"FINGERPRINT_EVAL_KEY_FILE": str(other)}):
            rewrite(self.rec_path, lambda d: None, resign=True)
        self.assertIn("signature invalid", self.reason())

    def test_unsigned_or_edited_authorization_rejected(self):
        p = self.pkg / RELEASE_AUTH
        orig = p.read_text()
        rewrite(p, lambda d: d.pop(R.SIG_FIELD))
        self.assertIn("unsigned", self.reason())
        p.write_text(orig)
        self.assertTrue(self.verify())
        rewrite(p, lambda d: d.update(authorized_at_utc="2020-01-01T00:00:00Z"))
        self.assertIn("signature invalid", self.reason())

    def test_record_path_must_be_inside_runs(self):
        auth = self.pkg / RELEASE_AUTH
        outside = self.pkg / "forged.json"
        outside.write_text(self.rec_path.read_text())
        for bad in (str(outside), "forged.json", f"{RUNS_DIR}/../../../forged.json", "evals/fingerprint-gate/raw/../../../forged.json"):
            rewrite(auth, lambda d, b=bad: d.update(record_path=b), resign=True)
            self.assertFalse(self.verify(), bad)

    def test_symlinked_record_rejected(self):
        real = self.root / "elsewhere.json"
        real.write_text(self.rec_path.read_text())
        (self.pkg / RUNS_DIR / "link.json").symlink_to(real)
        rewrite(self.pkg / RELEASE_AUTH, lambda d: d.update(record_path=f"{RUNS_DIR}/link.json"), resign=True)
        self.assertIn("symlink", self.reason())

    def test_symlinked_runs_dir_rejected(self):
        runs = self.pkg / RUNS_DIR
        moved = self.root / "moved-runs"
        runs.rename(moved)
        runs.symlink_to(moved)
        self.assertIn("symlink", self.reason())

    def test_raw_report_must_exist_and_match_signed_sha(self):
        rec = R.load_record(self.rec_path)
        raw = self.pkg / rec.raw_report_path
        self.assertTrue(rec.raw_report_sha256)
        orig = raw.read_bytes()
        raw.write_bytes(orig + b" ")
        self.assertIn("raw gate report differs", self.reason())
        raw.write_bytes(orig)
        self.assertTrue(self.verify())
        raw.unlink()
        self.assertFalse(self.verify())

    def test_raw_report_path_must_be_contained(self):
        (self.pkg / "stray.json").write_text("{}")
        sha = hashlib.sha256(b"{}").hexdigest()
        rewrite(self.rec_path, lambda d: d.update(raw_report_path="stray.json", raw_report_sha256=sha), resign=True)
        self.assertIn("outside", self.reason())

    def test_key_created_0600_in_0700_dir(self):
        key = Path(os.environ["FINGERPRINT_EVAL_KEY_FILE"])
        self.assertEqual(stat.S_IMODE(key.stat().st_mode), 0o600)
        fresh = self.root / "newdir" / "k"
        with mock.patch.dict(os.environ, {"FINGERPRINT_EVAL_KEY_FILE": str(fresh)}):
            R.sign({"a": 1})
        self.assertEqual(stat.S_IMODE(fresh.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(fresh.parent.stat().st_mode), 0o700)

    def test_loose_key_permissions_refused(self):
        Path(os.environ["FINGERPRINT_EVAL_KEY_FILE"]).chmod(0o644)
        with self.assertRaises(R.RecordError):
            R.sign({"a": 1})
        self.assertFalse(self.verify())


class Bindings(Base):
    def setUp(self):
        super().setUp()
        self.pkg = self.make_pkg("bound", (self.pkg / "article-medium.md").read_text(), bound=True)
        self.assertEqual(self.authorize(self.pkg), 0)
        self.assertTrue(self.verify(self.pkg))

    def test_binding_carries_tree_and_reference_hashes(self):
        b = R.list_records(self.pkg)[0][1].binding
        self.assertEqual(b.evaluator_tree_sha256, "t" * 64)
        self.assertEqual(b.reference_sha256, authz.sha256_file(self.pkg / "article-v1.md"))
        self.assertEqual(b.reference_record_sha256, authz.sha256_file(self.pkg / "evals/prepublish-v1.json"))

    def test_same_git_sha_different_tree_fails(self):
        self.ev["v"] = EvaluatorVersion("a" * 40, "u" * 64, False)
        ok, why = release.verify_package(self.pkg)
        self.assertFalse(ok)
        self.assertIn("evaluator_tree_sha256", why)

    def test_reference_bytes_change_fails(self):
        (self.pkg / "article-v1.md").write_text(ARTICLE + "\nAn extra closing sentence about the reactor crew.\n")
        ok, why = release.verify_package(self.pkg)
        self.assertFalse(ok)
        self.assertIn("reference", why)

    def test_reference_record_change_fails(self):
        p = self.pkg / "evals/prepublish-v1.json"
        d = json.loads(p.read_text())
        d["note"] = "edited"
        p.write_text(json.dumps(d))
        ok, why = release.verify_package(self.pkg)
        self.assertFalse(ok)
        self.assertIn("reference", why)

    def test_old_style_binding_without_new_fields_never_verifies(self):
        def strip(d):
            for k in ("evaluator_tree_sha256", "reference_sha256", "reference_record_sha256"):
                d["binding"].pop(k, None)
        rewrite(next((self.pkg / RUNS_DIR).glob("*.json")), strip, resign=True)
        self.assertFalse(self.verify(self.pkg))


class GateCoverage(Base):
    def test_prose_segment_without_claims_is_malformed_error(self):
        pkg = self.make_pkg("zero", ARTICLE.replace("Nobody disputed", "Nobody questioned"))
        ctx = authz.resolve_package(pkg)
        real = self.fakes.extract_reply
        # part two yields only discourse claims (filtered as meta): zero claims for a prose segment
        self.fakes.extract_reply = lambda p: json.dumps({"role": "r", "propositions": [{"claim": "The passage moves on to budgets.", "links": []}]}) if "budget" in p else real(p)
        rec = authz.evaluate_package(ctx, ctx.final_path)
        self.assertEqual((rec.result, rec.category), (Result.ERROR, Category.MALFORMED_MODEL_OUTPUT))

    def test_gate_rejects_uncovered_prose_even_from_cache(self):
        with mock.patch.object(G, "ensure_extraction", lambda segs, *a, **k: "cache"):
            with self.assertRaises(EvaluationError) as cm:
                G.evaluate(self.pkg / "article-medium.md", self.pkg / "article-v1.md", self.corpus, self.root, self.root / "o", "claude:sonnet", "claude:sonnet", 0.9, False)
        self.assertIs(cm.exception.category, Category.MALFORMED_MODEL_OUTPUT)


class AddedCoverage(Base):
    FINAL = ARTICLE.replace("Nobody disputed that figure.", "Nobody disputed that figure. Shipping delays caused the overrun.")

    def run_added(self, reply):
        self.fakes.extract_reply = lambda p, real=self.fakes.extract_reply: reply(p) if "Shipping delays" in p else real(p)
        pkg = self.make_pkg("add", self.FINAL)
        ctx = authz.resolve_package(pkg)
        return authz.evaluate_package(ctx, ctx.final_path)

    def test_empty_post_filter_extraction_is_error(self):
        rec = self.run_added(lambda p: json.dumps({"role": "r", "propositions": [{"claim": "The passage moves on to something else.", "links": []}]}))
        self.assertEqual((rec.result, rec.category), (Result.ERROR, Category.MALFORMED_MODEL_OUTPUT))
        self.assertIn("no factual claims", rec.reasons[0])

    def test_sentence_without_a_claim_is_error(self):
        rec = self.run_added(lambda p: json.dumps({"role": "r", "propositions": [{"claim": "Whales sing complex songs underwater.", "links": []}]}))
        self.assertEqual((rec.result, rec.category), (Result.ERROR, Category.MALFORMED_MODEL_OUTPUT))
        self.assertIn("without a claim", rec.reasons[0])

    def test_covered_sentence_still_judged(self):
        self.fakes.judge_reply = lambda p: json.dumps([{"i": 1, "verdict": "unsupported", "reason": "r"}]) if "Reference material:" in p else Fakes._judge(p)
        rec = self.run_added(lambda p: json.dumps({"role": "r", "propositions": [{"claim": "Shipping delays caused the overrun.", "links": []}]}))
        self.assertEqual(rec.category, Category.ADDED_UNSUPPORTED_CLAIM)

    def test_uncovered_sentences_unit(self):
        self.assertEqual(added.uncovered_sentences(["Shipping delays caused the overrun."], ["Delays in shipping caused the overrun"]), [])
        self.assertEqual(len(added.uncovered_sentences(["Shipping delays caused the overrun."], ["Whales sing"])), 1)


SECRET = {"OPENAI_API_KEY": "sk-x", "ANTHROPIC_API_KEY": "sk-y", "LLM_GATEWAY_API_KEY": "gw", "GITHUB_TOKEN": "gh", "AWS_SECRET_ACCESS_KEY": "aws"}


@pytest.mark.parametrize("call", ["heal", "nightly", "watchdog"])
def test_subprocesses_get_allowlisted_env(monkeypatch, call):
    module = {"heal": heal, "nightly": nightly, "watchdog": watchdog}[call]
    seen = []

    def fake(cmd, *a, **kw):
        seen.append(kw.get("env"))
        return subprocess.CompletedProcess(cmd, 0, "ok", "")
    monkeypatch.setattr(module.subprocess, "run", fake)
    for k, v in SECRET.items():
        monkeypatch.setenv(k, v)
    if call == "heal":
        heal._probe_codex()
    elif call == "nightly":
        nightly.run_authorize(Path("/nonexistent"))
    else:
        watchdog._probe_cmd(["codex", "--version"])
    assert seen and all(isinstance(e, dict) for e in seen), "env must be passed explicitly"
    for e in seen:
        assert not set(SECRET) & set(e)
        assert "PATH" in e


def test_clamp_cycles():
    assert clamp_cycles(2) == 2 and clamp_cycles(-5) == 0 and clamp_cycles(10**9) == MAX_REPAIR_CYCLES and clamp_cycles(2.0) == 2
    for bad in (float("nan"), float("inf"), -float("inf"), "3", None, True, 1.5):
        with pytest.raises(ValueError):
            clamp_cycles(bad)


def test_heal_loop_rejects_non_finite():
    for bad in (float("inf"), float("nan")):
        with pytest.raises(ValueError):
            heal.run_heal_loop(None, None, None, bad)


class ReleaseCycles(Base):
    def test_release_boundary_rejects_non_finite_and_clamps(self):
        self.assertEqual(release.authorize(self.pkg, max_repairs=float("inf"), out=lambda *a: None), 2)
        seen = []
        with mock.patch.object(release, "_load_heal", lambda: (lambda ctx, gate, rep, n: seen.append(n) or release._single_run(ctx, gate), None)):
            release.authorize(self.pkg, max_repairs=99, out=lambda *a: None)
        self.assertEqual(seen, [MAX_REPAIR_CYCLES])


def test_verify_detail_hash_comes_from_checked_bytes_and_is_none_when_invalid(tmp_path):
    from scripts.fingerprint_eval import release
    ok, why, sha = release.verify_package_detail(tmp_path)  # not a package: invalid
    assert not ok and sha is None
