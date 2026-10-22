import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.fingerprint_eval import gate as GATE
from scripts.fingerprint_eval.run import main
from scripts.fingerprint_eval.tests.fakes import ARTICLE, Fakes, argv, gate_json, workspace

REPO = Path(__file__).resolve().parents[3]


class GateBase(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.root = Path(self._td.name)
        self.addCleanup(self._td.cleanup)

    def run_gate(self, article=ARTICLE, draft=ARTICLE, *extra, with_draft=True, fakes=None):
        w = workspace(self.root, article, draft)
        f = fakes or Fakes()
        with f:
            rc = main(argv(w, *extra, draft=with_draft))
        return rc, w, f


class Setup(GateBase):
    def cli(self, *args):
        env = {"PATH": "/usr/bin:/bin", "LLM_GATEWAY_API_KEY": "x", "HOME": str(self.root)}
        return subprocess.run([sys.executable, "-m", "scripts.fingerprint_eval.run", *args], cwd=REPO, capture_output=True, text=True, env=env)

    def test_missing_draft_is_error_not_self_compare(self):
        w = workspace(self.root)
        p = self.cli(*argv(w, draft=False))
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)
        g = gate_json(w)
        self.assertFalse(g["pass"]); self.assertFalse(g["evaluated"])
        self.assertIn("--draft is required", g["reasons"][0])

    def test_same_path_is_error(self):
        w = workspace(self.root)
        w["draft"] = w["article"]
        p = self.cli(*argv(w))
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)
        self.assertIn("same path", gate_json(w)["reasons"][0])

    def test_missing_files_and_dirs_are_error(self):
        w = workspace(self.root)
        w["article"].unlink()
        self.assertEqual(self.cli(*argv(w)).returncode, 2)
        w2 = workspace(Path(tempfile.mkdtemp(dir=self.root)))
        w2["pipe"].rmdir()
        self.assertEqual(self.cli(*argv(w2)).returncode, 2)

    def test_threshold_validated(self):
        for bad in ("0", "-0.1", "1.5", "nan", "inf"):
            with self.subTest(bad), tempfile.TemporaryDirectory() as td:
                w = workspace(Path(td))
                self.assertEqual(self.cli(*argv(w, "--gate-threshold", bad)).returncode, 2)
        with Fakes():
            w = workspace(self.root)
            self.assertEqual(main(argv(w, "--gate-threshold", "1.0")), 0)

    def test_gate_with_research_tier_is_not_a_pass(self):
        w = workspace(self.root)
        self.assertEqual(self.cli(*argv(w, "--tier", "research")).returncode, 2)


class Verdicts(GateBase):
    def test_identical_content_passes_and_is_recorded(self):
        rc, w, _ = self.run_gate()
        self.assertEqual(rc, 0)
        g = gate_json(w)
        self.assertTrue(g["reference_identical"]); self.assertTrue(g["pass"]); self.assertEqual(g["exit_code"], 0)

    def test_changed_claim_fails(self):
        rc, w, _ = self.run_gate(article=ARTICLE.replace("forty days", "four days"))
        self.assertEqual(rc, 1)
        g = gate_json(w)
        self.assertFalse(g["reference_identical"]); self.assertTrue(g["evaluated"])
        self.assertTrue(any("claims changed" in r for r in g["reasons"]))

    def test_frozen_list_change_fails_with_diff(self):
        rc, w, _ = self.run_gate(article=ARTICLE.replace("item beta two", "item beta three"))
        self.assertEqual(rc, 1)
        reason = "\n".join(gate_json(w)["reasons"])
        self.assertIn("frozen blocks", reason)
        self.assertIn("- item beta two", reason)
        self.assertIn("+- item beta three", reason)
        self.assertIn("item beta three", reason)

    def test_frozen_quote_change_fails(self):
        rc, w, _ = self.run_gate(article=ARTICLE.replace("quoted line stays put", "quoted line moved"))
        self.assertEqual(rc, 1)
        self.assertIn("quoted line", "\n".join(gate_json(w)["reasons"]))

    def test_frozen_table_change_fails(self):
        tbl = "| a | b |\n|---|---|\n| 1 | 2 |"
        rc, w, _ = self.run_gate(article=ARTICLE.replace("## Part two", tbl + "\n\n## Part two").replace("| 1 | 2 |", "| 1 | 3 |"), draft=ARTICLE.replace("## Part two", tbl + "\n\n## Part two"))
        self.assertEqual(rc, 1)
        self.assertIn("| 1 | 3 |", "\n".join(gate_json(w)["reasons"]))

    def test_inline_image_dropped_fails(self):
        base = ARTICLE.replace("The reactor ran", "![r](a.png) The reactor ran")
        rc, w, _ = self.run_gate(article=ARTICLE, draft=base)
        self.assertEqual(rc, 1)
        self.assertTrue(any("images not preserved" in r for r in gate_json(w)["reasons"]))

    def test_extractor_passed_through_and_recorded(self):
        rc, w, f = self.run_gate(ARTICLE, ARTICLE, "--extractor", "claude:haiku")
        self.assertEqual(rc, 0)
        self.assertIn("haiku", f.models)
        g = gate_json(w)
        self.assertEqual(g["extractor"]["spec"], "claude:haiku")
        self.assertEqual(g["extractor"]["id"], "claude-cli:haiku")


class ErrorsAreExit2(GateBase):
    def assert_error(self, rc, w, needle=""):
        self.assertEqual(rc, 2)
        g = gate_json(w)
        self.assertFalse(g["pass"]); self.assertFalse(g["evaluated"])
        self.assertIn(needle, g["reasons"][0])

    def test_zero_claims_for_a_prose_segment(self):
        f = Fakes()
        f.extract_reply = lambda p: json.dumps({"role": "r", "propositions": []})
        rc, w, _ = self.run_gate(fakes=f)
        self.assert_error(rc, w, "extraction failed")

    def test_zero_claims_in_cache_is_error(self):
        w = workspace(self.root)
        with Fakes():
            main(argv(w))
        cache = w["out"] / "gate-extraction.json"
        c = json.loads(cache.read_text())
        first = next(iter(c["segments"]))
        c["segments"][first]["propositions"] = []
        cache.write_text(json.dumps(c))
        with Fakes():
            rc = main(argv(w))
        self.assert_error(rc, w, "zero claims")

    def test_no_prose_means_zero_claims_error(self):
        only = "# T\n\n## S\n\n- a list item one\n- a list item two\n"
        rc, w, _ = self.run_gate(only, only)
        self.assert_error(rc, w, "zero claims")

    def test_judge_garbage_is_error_after_one_retry(self):
        f = Fakes()
        f.judge_reply = lambda p: 'Sure! [{"i": 1, "verdict": "entailed"}] hope that helps'
        rc, w, _ = self.run_gate(fakes=f)
        self.assert_error(rc, w, "judge failed")
        self.assertEqual(f.calls["judge"], 2)

    def test_judge_retry_recovers(self):
        f = Fakes()
        real, n = f._judge, {"n": 0}
        def flaky(p):
            n["n"] += 1
            return "not json" if n["n"] == 1 else real(p)
        f.judge_reply = flaky
        rc, _, _ = self.run_gate(fakes=f)
        self.assertEqual(rc, 0)

    def test_judge_network_error_is_error_not_unjudged_fail(self):
        from scripts.fingerprint_eval.gateway import GatewayError
        f = Fakes()
        def boom(p):
            raise GatewayError("network: down")
        f.judge_reply = boom
        rc, w, _ = self.run_gate(fakes=f)
        self.assert_error(rc, w, "judge failed")

    def test_embedding_failures_are_error(self):
        for name, fn in {"count": lambda t: [[1.0, 2.0]] * (len(t) + 1), "nan": lambda t: [[float("nan")] * 4 for _ in t],
                         "zero": lambda t: [[0.0] * 4 for _ in t]}.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as td:
                w = workspace(Path(td))
                f = Fakes(); f.embed = fn
                with f:
                    self.assertEqual(main(argv(w)), 2)

    def test_gate_json_write_failure_is_error(self):
        w = workspace(self.root)
        with Fakes(), mock.patch.object(GATE, "_write", side_effect=OSError("disk full")):
            self.assertEqual(main(argv(w)), 2)
        self.assertFalse((w["out"] / "gate.json").exists())

    def test_unexpected_exception_is_error(self):
        w = workspace(self.root)
        with Fakes(), mock.patch.object(GATE, "segment_article", side_effect=RuntimeError("bug")):
            rc = main(argv(w))
        self.assert_error(rc, w, "RuntimeError")

    def test_stale_gate_json_removed_on_error(self):
        w = workspace(self.root)
        w["out"].mkdir()
        (w["out"] / "gate.json").write_text('{"pass": true, "exit_code": 0}')
        with Fakes():
            rc = main(argv(w, draft=False))
        self.assert_error(rc, w, "--draft")


class ExtractionCache(GateBase):
    def test_cache_bound_to_content_and_refresh(self):
        w = workspace(self.root)
        f = Fakes()
        with f:
            self.assertEqual(main(argv(w)), 0)
            first = f.calls["extract"]
            self.assertEqual(first, 2)
            cache = json.loads((w["out"] / "gate-extraction.json").read_text())
            for k in ("schema_version", "source_sha256", "extractor", "segments"):
                self.assertIn(k, cache)
            self.assertTrue(all("hash" in s for s in cache["segments"].values()))
            self.assertEqual(main(argv(w)), 0)
            self.assertEqual(f.calls["extract"], first)  # valid cache reused
            self.assertEqual(gate_json(w)["extractor"]["source"], "cache")
            main(argv(w, "--refresh-extraction"))
            self.assertEqual(f.calls["extract"], first * 2)  # honored in gate mode
            # draft content changed with the same cache file: regenerated, not trusted
            w["draft"].write_text(ARTICLE.replace("forty days", "ninety days"))
            w["article"].write_text(ARTICLE.replace("forty days", "ninety days"))
            before = f.calls["extract"]
            self.assertEqual(main(argv(w)), 0)
            self.assertEqual(f.calls["extract"], before + 2)

    def test_missing_segment_hash_extractor_or_schema_regenerates(self):
        w = workspace(self.root)
        f = Fakes()
        cp = w["out"] / "gate-extraction.json"
        with f:
            main(argv(w))
            for tamper in (lambda c: c["segments"].pop(next(iter(c["segments"]))),
                           lambda c: c["segments"][next(iter(c["segments"]))].update(hash="bad"),
                           lambda c: c.update(extractor="other:model"),
                           lambda c: c.update(schema_version=1),
                           lambda c: c.pop("source_sha256")):
                c = json.loads(cp.read_text()); tamper(c); cp.write_text(json.dumps(c))
                before = f.calls["extract"]
                self.assertEqual(main(argv(w)), 0)
                self.assertEqual(f.calls["extract"], before + 2)
            cp.write_text("{not json")
            before = f.calls["extract"]
            self.assertEqual(main(argv(w)), 0)
            self.assertEqual(f.calls["extract"], before + 2)


if __name__ == "__main__":
    unittest.main()
