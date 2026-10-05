import contextlib
import hashlib
import io
import json
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from scripts.fingerprint_eval import nightly as N
from scripts.fingerprint_eval import record as R
from scripts.fingerprint_eval import watchdog as W

TODAY = date(2026, 10, 4)
PROSE = ("The market moved fast in the autumn, and nobody saw the shift coming. "
         "Prices rose, wages stalled, and trust eroded across the board.\n\n"
         "Analysts disagreed about the cause, the timing, and the remedy. Some blamed policy.\n\n")


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _binding(h: str) -> dict:
    return {"content_sha256": h, "evaluator_id": "e" * 12, "author_corpus_sha256": "c" * 64}


def _record_dict(slug: str, h: str, result: str, raw_rel: str, raw_sha: str) -> dict:
    cat = {"PASS": "PASS", "FAIL": "CONTENT_CLAIM_FAILURE"}.get(result, "UNKNOWN_ERROR")
    return {"schema_version": R.SCHEMA_VERSION, "slug": slug, "binding": _binding(h), "final_path": "article-v1.md", "final_rule": "test",
            "reference_path": None, "reference_sha256": None, "reference_identical": False, "timestamp_utc": "2026-09-20T10:00:00Z",
            "evaluator_tree_sha256": "t" * 64, "pipeline_corpus_sha256": "p" * 64, "models": {}, "claims": {}, "links": {},
            "structure": {}, "semantic": {}, "advisory": {}, "result": result, "category": cat, "reasons": [], "runtime_s": 1.0,
            "raw_report_path": raw_rel, "heal_cycle": 0, "parent_content_sha256": None, "cache_hit": False, "raw_report_sha256": raw_sha}


def make_pkg(ws: Path, slug: str, body: str = PROSE, *, medium=None, release="match", result="PASS",
             quarantine=None, updated="2026-09-20T10:00:00Z", runs=True, sign=True):
    """Records and authorization are signed with the conftest test key like the real gate; sign=False writes forged unsigned files."""
    pkg = ws / "articles" / slug
    (pkg / "evals/fingerprint-gate/runs").mkdir(parents=True)
    (pkg / "evals/fingerprint-gate/raw").mkdir(parents=True)
    (pkg / "article-v1.md").write_text(body)
    (pkg / "version.json").write_text(json.dumps({"articleFile": "article-v1.md", "updatedAt": updated}))
    wf = {"mediumDraft": medium} if medium is not None else {}
    (pkg / "workflow.json").write_text(json.dumps(wf))
    h = sha(body.encode())
    rec_rel = f"evals/fingerprint-gate/runs/20260920T100000Z-{h[:12]}.json"
    out = R.signed if sign else (lambda d: d)
    if runs:
        raw = b'{"gate": "raw"}'
        (pkg / "evals/fingerprint-gate/raw/gate.json").write_bytes(raw)
        rec = _record_dict(slug, h, result, "evals/fingerprint-gate/raw/gate.json", sha(raw))
        (pkg / rec_rel).write_text(json.dumps(out(rec)))
    if release:
        (pkg / "release").mkdir()
        rel = body.encode() if release == "match" else b"edited after authorization"
        (pkg / "release/medium-final.md").write_bytes(rel)
        auth = {"binding": _binding(h), "record_path": rec_rel, "authorized_at_utc": "2026-09-20T10:05:00Z", "release_article_sha256": h}
        (pkg / "release/authorization.json").write_text(json.dumps(out(auth)))
    if quarantine:
        (pkg / "QUARANTINE.json").write_text(json.dumps({"status": "NEEDS_REVIEW", "category": quarantine}))
    return pkg


def run_main(ws: Path, *extra: str):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = N.main(["--workspace", str(ws), "--no-probes", "--author-corpus", str(ws / "none"), *extra], today=TODAY)
    return rc, buf.getvalue()


def snapshot(root: Path):
    return {str(p): (p.stat().st_mtime_ns, sha(p.read_bytes())) for p in sorted(root.rglob("*")) if p.is_file()}


class Base(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.ws = Path(self._td.name)
        self.addCleanup(self._td.cleanup)

    def report(self):
        return json.loads((self.ws / "reports/fingerprint-nightly/2026-10-04.json").read_text())


class Integrity(Base):
    def test_scheduled_with_matching_pass_is_ok(self):
        make_pkg(self.ws, "a", medium={"status": "scheduled", "publishDate": "2026-10-01"})
        rc, out = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 0)
        pk = {p["slug"]: p for p in self.report()["watchdog"]["packages"]}
        self.assertEqual(pk["a"]["integrity"], "OK")
        self.assertIn("No integrity violations", out)

    def test_mismatched_hash_is_critical_exit_5(self):
        make_pkg(self.ws, "bad", medium={"status": "scheduled", "publishDate": "2026-10-01"}, release="mismatch")
        make_pkg(self.ws, "good", medium={"status": "scheduled"})
        rc, out = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 5)
        crit = self.report()["watchdog"]["critical"]
        self.assertEqual([c["slug"] for c in crit], ["bad"])
        self.assertIn("CRITICAL", out)
        md = (self.ws / "reports/fingerprint-nightly/2026-10-04.md").read_text()
        self.assertLess(md.index("CRITICAL"), md.index("## Watchdog"))

    def test_missing_authorization_is_critical(self):
        make_pkg(self.ws, "x", medium={"status": "live_on_medium_verified", "postId": "abc"}, release=None)
        rc, _ = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 5)

    def test_fail_record_is_critical_even_with_matching_hash(self):
        make_pkg(self.ws, "x", medium={"status": "scheduled"}, result="FAIL")
        rc, _ = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 5)

    def _crit_reason(self, slug="x"):
        rc, _ = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 5)
        return {c["slug"]: c["integrity_reason"] for c in self.report()["watchdog"]["critical"]}[slug]

    def test_forged_unsigned_record_is_critical(self):
        make_pkg(self.ws, "x", medium={"status": "scheduled"}, sign=False)
        self.assertIn("unsigned", self._crit_reason())

    def test_tampered_authorization_is_critical(self):
        pkg = make_pkg(self.ws, "x", medium={"status": "scheduled"})
        p = pkg / "release/authorization.json"
        d = json.loads(p.read_text())
        d["authorized_at_utc"] = "2026-09-21T00:00:00Z"  # edit without re-signing
        p.write_text(json.dumps(d))
        self.assertIn("signature invalid", self._crit_reason())

    def test_tampered_signed_record_is_critical(self):
        pkg = make_pkg(self.ws, "x", medium={"status": "scheduled"})
        rec = next((pkg / "evals/fingerprint-gate/runs").glob("*.json"))
        d = json.loads(rec.read_text())
        d["reasons"] = ["edited"]
        rec.write_text(json.dumps(d))
        self.assertIn("signature invalid", self._crit_reason())

    def test_uncontained_record_path_is_critical(self):
        pkg = make_pkg(self.ws, "x", medium={"status": "scheduled"})
        h = sha(PROSE.encode())
        (pkg / "release/elsewhere.json").write_text(next((pkg / "evals/fingerprint-gate/runs").glob("*.json")).read_text())
        auth = {"binding": _binding(h), "record_path": "release/elsewhere.json",
                "authorized_at_utc": "2026-09-20T10:05:00Z", "release_article_sha256": h}
        (pkg / "release/authorization.json").write_text(json.dumps(R.signed(auth)))
        self.assertIn("outside", self._crit_reason())

    def test_raw_report_hash_mismatch_is_critical(self):
        pkg = make_pkg(self.ws, "x", medium={"status": "scheduled"})
        (pkg / "evals/fingerprint-gate/raw/gate.json").write_bytes(b'{"gate": "swapped"}')
        self.assertIn("raw gate report", self._crit_reason())

    def test_later_edit_to_current_final_does_not_flag_published_release(self):
        pkg = make_pkg(self.ws, "x", medium={"status": "scheduled"})
        (pkg / "article-v1.md").write_text(PROSE + "A later edit after publication.\n\n")
        rc, _ = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 0)
        self.assertEqual({p["slug"]: p["integrity"] for p in self.report()["watchdog"]["packages"]}["x"], "OK")

    def test_invalid_authorization_is_not_hidden_as_legacy(self):
        make_pkg(self.ws, "old", medium={"status": "scheduled", "publishDate": "2026-08-18"}, sign=False, updated="2026-08-10T10:00:00Z")
        rc, _ = run_main(self.ws, "--enforced-since", "2026-10-01")
        self.assertEqual(rc, 5)

    def test_legacy_package_is_legacy_ungated(self):
        make_pkg(self.ws, "old", medium={"status": "scheduled", "publishDate": "2026-08-18"}, release=None, runs=False,
                 updated="2026-08-10T10:00:00Z")
        rc, _ = run_main(self.ws, "--enforced-since", "2026-10-01")
        self.assertEqual(rc, 0)
        r = self.report()["watchdog"]
        self.assertEqual([x["slug"] for x in r["legacy_ungated"]], ["old"])
        self.assertEqual(r["critical"], [])

    def test_unscheduled_packages_never_flagged(self):
        make_pkg(self.ws, "draft", medium={"status": "not_created_waiting_for_approval", "mediumUrl": None}, release=None)
        make_pkg(self.ws, "stale", medium={"status": "created_v3_stale", "url": "https://medium.com/p/1/edit"}, release=None)
        rc, _ = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 0)
        self.assertEqual(self.report()["watchdog"]["counts"]["scheduled_or_published"], 0)

    def test_queue_posted_detected(self):
        make_pkg(self.ws, "q", medium=None, release=None)
        (self.ws / W.QUEUE_FILE).write_text(json.dumps({"items": [{"articleSlug": "q", "status": "posted",
                                                                  "mediumPublishedAt": "Tue, 29 Sep 2026 03:26:01 GMT"}]}))
        rc, _ = run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(rc, 5)

    def test_counts_and_circuits(self):
        make_pkg(self.ws, "p1")
        make_pkg(self.ws, "e1", result="ERROR", release=None)
        make_pkg(self.ws, "q1", release=None, quarantine="CONTENT_CLAIM_FAILURE")
        (self.ws / "fingerprint-eval").mkdir()
        (self.ws / "fingerprint-eval/circuits.json").write_text(json.dumps(
            {"gateway-chat": {"consecutive_failures": 3, "opened_at": "2026-10-04T00:00:00Z"}}))
        run_main(self.ws)
        r = self.report()["watchdog"]
        c = r["counts"]
        self.assertEqual((c["generated"], c["evaluated"], c["authorized"], c["unresolved_errors"]), (3, 3, 1, 1))
        self.assertEqual(c["quarantined_by_category"], {"CONTENT_CLAIM_FAILURE": 1})
        self.assertEqual(r["circuits"]["gateway-chat"]["state"], "open")


class Retry(Base):
    def test_infra_retried_editorial_not(self):
        make_pkg(self.ws, "infra", release=None, quarantine="GATEWAY_FAILURE")
        make_pkg(self.ws, "edit", release=None, quarantine="ADDED_UNSUPPORTED_CLAIM")
        make_pkg(self.ws, "review", release=None, quarantine="NEEDS_REVIEW")
        with mock.patch.object(N, "run_authorize", return_value=0) as ra:
            run_main(self.ws, "--retry-infra-quarantine")
        self.assertEqual([c.args[0].name for c in ra.call_args_list], ["infra"])
        acts = {r["slug"]: r["action"] for r in self.report()["infra_retries"]}
        self.assertEqual(acts, {"edit": "skipped_editorial", "infra": "authorize", "review": "skipped_editorial"})

    def test_no_retry_without_flag(self):
        make_pkg(self.ws, "infra", release=None, quarantine="MODEL_TIMEOUT")
        with mock.patch.object(N, "run_authorize") as ra:
            run_main(self.ws)
        ra.assert_not_called()

    def test_authorize_invoked_via_release_cli(self):
        pkg = make_pkg(self.ws, "infra", release=None, quarantine="DEPENDENCY_FAILURE")
        with mock.patch("subprocess.run", return_value=mock.Mock(returncode=4)) as sp:
            self.assertEqual(N.run_authorize(pkg), 4)
        cmd = sp.call_args.args[0]
        self.assertEqual(cmd[1:5], ["-m", "scripts.fingerprint_eval.release", "authorize", "--package"])


class ReadOnly(Base):
    def test_run_never_writes_inside_packages(self):
        for i in range(4):
            make_pkg(self.ws, f"s{i}", PROSE + f"Extra sentence number {i} about prices, wages, and trust.\n\n",
                     medium={"status": "scheduled"} if i % 2 else None)
        before = snapshot(self.ws / "articles")
        run_main(self.ws, "--enforced-since", "2026-01-01")
        self.assertEqual(snapshot(self.ws / "articles"), before)
        self.assertTrue((self.ws / "reports/fingerprint-nightly/2026-10-04.md").exists())


class Determinism(Base):
    def _articles(self):
        for i in range(5):
            make_pkg(self.ws, f"a{i}", PROSE + "Nobody saw the shift coming in the autumn markets, again and again.\n\n"
                     f"Unique tail {i} words here, there, and everywhere today.\n\n", updated=f"2026-09-{10 + i}T00:00:00Z")

    def test_repetition_metrics_deterministic(self):
        self._articles()
        a = N.analyze(self.ws, None, self.ws / "none")
        b = N.analyze(self.ws, None, self.ws / "none")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))
        grams = [g["ngram"] for g in a["repeated_ngrams"]]
        self.assertTrue(any("shift coming" in g for g in grams))
        self.assertTrue(a["repeated_ngrams"][0]["articles"] == 5)
        self.assertIsNotNone(a["rule_of_three"]["mean_per_1k"])
        self.assertIn("series", a["convergence"] if "skipped" not in a["convergence"] else {"series": 1})
        self.assertIn("skipped", a["author_drift"])

    def test_report_json_stable_across_runs(self):
        self._articles()
        run_main(self.ws)
        one = (self.ws / "reports/fingerprint-nightly/2026-10-04.json").read_text()
        run_main(self.ws)
        self.assertEqual(one, (self.ws / "reports/fingerprint-nightly/2026-10-04.json").read_text())


if __name__ == "__main__":
    unittest.main()
