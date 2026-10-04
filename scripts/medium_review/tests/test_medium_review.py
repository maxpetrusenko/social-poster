import json
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.medium_review import autofix as AF
from scripts.medium_review import checks as CK
from scripts.medium_review import editorial as ED
from scripts.medium_review import nightly_learning as NL
from scripts.medium_review import policy as POL
from scripts.medium_review import review as RV
from scripts.medium_review import scorecard as SC
from scripts.medium_review.cli import main as cli_main
from scripts.medium_review.package import resolve

BODY = ("The first clue is a fencing sword shaking by itself. Vic Tandy worked around medical equipment and had little patience for ghost stories. "
        "His colleagues said the lab felt wrong and they felt watched by something at the edge of vision.")
ARTICLE = f"""# A Ghost Became A Waveform

*An engineer traces a haunted lab to infrasound from a ventilation fan.*

![](assets/hidden-body-signals-hero.png)

{BODY}

## The standing wave

Tandy moved the table and watched the blade's vibration rise and fall until the dread made engineering sense.

![](assets/frame-01.jpg)
*A haunted laboratory becomes an engineering problem.*

[12:34](https://www.youtube.com/watch?v=abc&t=754) is where the lab appears.

## Sources

- [Tandy and Lawrence](https://www.richardwiseman.com/resources/ghost-in-machine.pdf)
"""
POLICY_TEXT = "Medium distribution boost guidelines. " * 200
POL_META = {"text": POLICY_TEXT, "sha256": "a" * 64, "sha12": "a" * 12, "updated_at": "2026-09-22T01:30:11Z",
            "policy_version": "aaaaaaaaaaaa@2026-09-22T01:30:11Z", "fetched_at": "2026-10-04T00:00:00+00:00", "method": "zendesk-api",
            "fetch_status": "fresh-fetch"}


def dim(rating="adequate", quote="fencing sword shaking by itself"):
    return {"rating": rating, "evidence_quote": quote, "note": "note"}


def good_reply(**over):
    d = {k: dim() for k in SC.DIMENSIONS}
    d.update({"distribution_risks": [{"risk": "derivative of a video", "category": "derivative", "evidence_quote": ""}],
              "boost_candidate": "UNCERTAIN", "general_distribution_risk": "MEDIUM", "recommendations": ["add author analysis"],
              "author_contribution": {"present": False, "integral": False, "evidence": []},
              "derivative_summary": True, "author_input_required": True})
    d.update(over)
    return json.dumps(d)


class Stub:
    def __init__(self, *replies):
        self.replies, self.calls = list(replies), 0

    def __call__(self, prompt):
        self.calls += 1
        return self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]


class Base(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.root = Path(self._td.name)
        self.addCleanup(self._td.cleanup)
        self.pkg = self.root / "pkg"
        self.pkg.mkdir()
        self.art = self.pkg / "draft.md"
        self.art.write_text(ARTICLE)

    def ctx(self):
        return resolve(self.pkg, self.art)


class Checks(Base):
    def ids(self, md, **kw):
        return {f["id"] for f in CK.run_checks(md, **kw)["findings"]}

    def test_core_findings(self):
        ids = self.ids(ARTICLE, package=self.pkg)
        self.assertIn("alt_missing", ids)
        self.assertIn("link_timestamp", ids)
        self.assertIn("length_short", ids)

    def test_duplicates_empty_links_formatting(self):
        md = f"# T\n\n## H\n\n{BODY}\n\n{BODY}\n\n[x]()\n\n#Bad heading\n\nTODO fill this in\n"
        ids = self.ids(md)
        self.assertTrue({"duplicate_paragraph", "link_empty", "formatting", "placeholder_text"} <= ids)

    def test_title_formulas(self):
        for title, want in [("Why Do We Dream?", "title_question"), ("7 Ways To Sleep", "title_listicle"),
                            ("You Won't Believe This", "title_clickbait"), ("THIS IS HUGE NEWS", "title_all_caps")]:
            self.assertIn(want, self.ids(f"# {title}\n\n*sub*\n\ntext\n"), title)
        self.assertIn("subtitle_missing", self.ids("# A Normal Title Here For Test\n\ntext only\n"))

    def test_tags_and_credit(self):
        (self.pkg / "version.json").write_text(json.dumps({"tags": ["a", "b", "c", "d", "e", "f"], "assets": [{"path": "assets/frame-01.jpg", "credit": "SciOne"}]}))
        c = self.ctx()
        ids = self.ids(ARTICLE, package=self.pkg, version=c.version)
        self.assertIn("tags_over_limit", ids)
        self.assertIn("image_credit_missing", ids)

    def test_source_links_vs_notes(self):
        (self.pkg / "sources").mkdir()
        (self.pkg / "sources" / "source-notes.md").write_text("[Nature](https://nature.com/x)\n")
        c = self.ctx()
        self.assertIn("source_link_missing", self.ids(ARTICLE, package=self.pkg, source_notes=c.source_notes))


class Cache(Base):
    def test_cache_hit_is_zero_calls_and_content_change_misses(self):
        stub = Stub(good_reply())
        r1 = RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)
        self.assertEqual((r1["status"], stub.calls, r1["cache_hit"]), ("REVIEWED", 1, False))
        r2 = RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)
        self.assertEqual((stub.calls, r2["cache_hit"]), (1, True))
        self.art.write_text(ARTICLE + "\nOne more sentence of real content for the reader.\n")
        RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)
        self.assertEqual(stub.calls, 2)
        other = {**POL_META, "policy_version": "bbbbbbbbbbbb@x", "sha12": "b" * 12, "sha256": "b" * 64}
        RV.run_review(self.ctx(), root=self.root, llm=stub, policy=other)
        self.assertEqual(stub.calls, 3)

    def test_evaluator_change_misses(self):
        stub = Stub(good_reply())
        RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)
        orig = SC.evaluator_id
        SC.evaluator_id = lambda: "different-sha"
        try:
            RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)
        finally:
            SC.evaluator_id = orig
        self.assertEqual(stub.calls, 2)

    def test_artifacts_and_sections(self):
        rec = RV.run_review(self.ctx(), root=self.root, llm=Stub(good_reply()), policy=POL_META)
        d = self.pkg / "evals" / "medium-distribution"
        for name in ("MEDIUM_REVIEW.json", "latest.json", "SUMMARY.md"):
            self.assertTrue((d / name).exists(), name)
        self.assertTrue(any(re.fullmatch(r"[0-9a-f]{12}-aaaaaaaaaaaa\.json", p.name) for p in d.iterdir()))
        for k in ("hard_policy_risks", "warnings", "boost_quality_opportunities", "safe_auto_fixes", "author_input_required"):
            self.assertIn(k, rec)
        self.assertEqual(rec["binding"]["policy_version"], POL_META["policy_version"])
        self.assertIn("does not guarantee Boost", (d / "SUMMARY.md").read_text())
        self.assertIn("does not guarantee Boost", rec["disclaimer"])


class Schema(Base):
    def test_good_garbage_retry(self):
        self.assertEqual(RV.validate(json.loads(good_reply()), ARTICLE)["boost_candidate"], "UNCERTAIN")
        stub = Stub("not json at all", "{}")
        r = RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)
        self.assertEqual((r["status"], stub.calls), ("ERROR", 2))
        self.assertEqual(json.loads((self.pkg / "evals/medium-distribution/MEDIUM_REVIEW.json").read_text())["status"], "ERROR")
        stub = Stub("garbage", good_reply())
        self.assertEqual(RV.run_review(self.ctx(), root=self.root, llm=stub, policy=POL_META)["status"], "REVIEWED")
        self.assertEqual(stub.calls, 2)

    def test_schema_violations(self):
        for bad in (good_reply(boost_candidate="MAYBE"), good_reply(general_distribution_risk="x"),
                    good_reply(writer_experience={"rating": "great", "evidence_quote": "q", "note": ""}),
                    good_reply(originality={"rating": "weak", "evidence_quote": "", "note": ""}),
                    good_reply(derivative_summary="yes")):
            with self.assertRaises(RV.SchemaError):
                RV.validate(json.loads(bad), ARTICLE)

    def test_quote_verification(self):
        out = RV.validate(json.loads(good_reply(sourcing=dim("weak", "invented quote nowhere"))), ARTICLE)
        self.assertTrue(out["originality"]["quote_found"])
        self.assertFalse(out["sourcing"]["quote_found"])

    def test_prompt_rules(self):
        p = RV.build_prompt(POLICY_TEXT, ARTICLE, [], {})
        for s in ("nuanced characteristics, not a checklist", "Do NOT judge AI-detectability", "substantive author contribution"):
            self.assertIn(s, p)

    def test_cli_exit_codes(self):
        orig = POL.load_policy
        POL.load_policy = lambda root=None, **kw: POL_META
        try:
            argv = ["review", "--package", str(self.pkg), "--article", str(self.art)]
            self.assertEqual(cli_main(argv, llm=Stub("junk")), 2)
            self.assertEqual(cli_main(argv, llm=Stub(good_reply())), 0)
            self.assertEqual(cli_main(["review", "--package", str(self.pkg), "--article", "nope.md"]), 2)
        finally:
            POL.load_policy = orig


class Autofix(Base):
    @staticmethod
    def prose(md):
        out = []
        for ln in md.split("\n"):
            if ln.startswith("![") or ln.startswith("*Image credit"):
                continue
            ln = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", ln).strip()
            if ln:
                out.append(ln)
        return out

    def test_fixes_do_not_change_prose(self):
        (self.pkg / "version.json").write_text(json.dumps({"assets": [{"path": "assets/frame-01.jpg", "credit": "SciOne"}], "tags": ["Science", "science", "x"]}))
        (self.pkg / "workflow.json").write_text(json.dumps({"tags": ["science"]}))
        md = ARTICLE + "\n\n\n\n[gone]()\n"
        self.art.write_text(md)
        fixes = AF.apply_fixes(self.ctx())
        kinds = [f["kind"] for f in fixes]
        self.assertTrue({"alt_text", "image_credit", "formatting", "tags"} <= set(kinds), kinds)
        last = [f for f in fixes if f["kind"] != "tags"][-1]
        after = Path(last["path"]).read_text()
        self.assertEqual(self.prose(after), self.prose(md.replace("[gone]()", "gone")))
        self.assertIn("![A haunted laboratory becomes an engineering problem.](assets/frame-01.jpg)", after)
        self.assertIn("![Hidden body signals hero](assets/hidden-body-signals-hero.png)", after)
        self.assertIn("*Image credit: SciOne*", after)
        self.assertNotIn("&t=754", after)
        self.assertEqual(self.art.read_text(), md)  # original untouched

    def test_never_overwrites(self):
        self.art.write_text(ARTICLE)
        a = AF.apply_fixes(self.ctx())
        b = AF.apply_fixes(self.ctx())
        self.assertFalse({x["path"] for x in a} & {x["path"] for x in b})

    def test_dedupe_and_source_link(self):
        (self.pkg / "sources").mkdir()
        (self.pkg / "sources" / "source-notes.md").write_text("[Nature](https://nature.com/x)\n")
        md = f"# T\n\n## Intro\n\n{BODY}\n\n{BODY}\n\n## Sources\n\n- one\n"
        self.art.write_text(md)
        fixes = AF.apply_fixes(self.ctx())
        out = Path([f for f in fixes if f["kind"] != "tags"][-1]["path"]).read_text()
        self.assertEqual(out.count("fencing sword"), 1)
        self.assertIn("- [Nature](https://nature.com/x)", out)

    def test_alt_never_invented_without_known_source(self):
        self.art.write_text("# T\n\ntext\n\n![](assets/IMG_0042.png)\n")
        out = AF.compute(self.art.read_text(), self.ctx())
        self.assertEqual([s for s in out if s["kind"] == "alt_text"], [])


class Editorial(Base):
    def record(self, weak_exp=False, weak=("reader_value",)):
        dims = {k: {"rating": "adequate", "note": "n"} for k in SC.DIMENSIONS}
        for k in weak:
            dims[k]["rating"] = "weak"
        if weak_exp:
            dims["writer_experience"]["rating"] = "weak"
        return {"scorecard": {"dimensions": dims, "author_contribution": {"present": not weak_exp, "integral": False, "evidence": []}},
                "author_input_required": {"required": weak_exp}}

    @staticmethod
    def wrap(text):
        return f"<<<CANDIDATE\n{text}\nCANDIDATE>>>\n- reordered"

    def test_rejects_invented_first_person(self):
        cand = ARTICLE.replace("The first clue", "I spent three years studying sleep myself. The first clue")
        res = ED.propose(self.ctx(), self.record(), Stub(self.wrap(cand)), self.root)
        self.assertEqual(res["status"], "REJECTED")
        self.assertTrue(any("first-person" in r for r in res["reasons"]))
        self.assertEqual(list(self.pkg.glob("article-medium-proposal-*")), [])

    def test_accepts_first_person_present_in_trusted_source(self):
        (self.pkg / "notes").mkdir()
        (self.pkg / "notes" / "me.md").write_text("I spent three years studying sleep myself.\n")
        cand = ARTICLE.replace("The first clue", "I spent three years studying sleep myself. The first clue")
        res = ED.propose(self.ctx(), self.record(), Stub(self.wrap(cand)), self.root)
        self.assertEqual(res["status"], "PROPOSED")
        self.assertTrue(res["requires_integrity_gate"])
        self.assertTrue(Path(res["diff_path"]).read_text().startswith("---"))

    def test_rejects_dropped_link_and_new_number(self):
        res = ED.propose(self.ctx(), self.record(), Stub(self.wrap(ARTICLE.replace("(https://www.richardwiseman.com/resources/ghost-in-machine.pdf)", "(https://x.test)"))), self.root)
        self.assertEqual(res["status"], "REJECTED")
        res = ED.propose(self.ctx(), self.record(), Stub(self.wrap(ARTICLE + "\nAbout 99 percent of labs agree.\n")), self.root)
        self.assertEqual(res["status"], "REJECTED")

    def test_good_structural_candidate(self):
        res = ED.propose(self.ctx(), self.record(), Stub(self.wrap(ARTICLE.replace("The standing wave", "Why the blade shook"))), self.root)
        self.assertEqual(res["status"], "PROPOSED")
        self.assertIsNone(res["flag"])

    def test_author_input_required_without_trusted_material(self):
        stub = Stub("unused")
        res = ED.propose(self.ctx(), self.record(weak_exp=True, weak=()), stub, self.root)
        self.assertEqual(res["flag"], "AUTHOR_INPUT_REQUIRED")
        self.assertEqual((res["status"], stub.calls, res["trusted_material_suggestions"]), ("NO_PROPOSAL_NEEDED", 0, []))
        self.assertTrue((self.root / "data/medium-policy/author-sources.json").exists())

    def test_trusted_material_reported_with_path(self):
        (self.pkg / "sources").mkdir()
        (self.pkg / "sources" / "mine.md").write_text("When I visited a ventilation fan lab, I felt the same dread at the edge of vision.\n")
        res = ED.propose(self.ctx(), self.record(weak_exp=True, weak=()), Stub("unused"), self.root)
        self.assertIsNone(res["flag"])
        self.assertTrue(res["trusted_material_suggestions"][0]["path"].endswith("sources/mine.md"))


class PolicyCache(Base):
    def fetch_ok(self):
        self.n = getattr(self, "n", 0) + 1
        return {"text": POLICY_TEXT, "method": "zendesk-api", "updated_at": "2026-09-22T01:30:11Z"}

    def test_cache_fallback_offline(self):
        p = POL.load_policy(self.root, fetch=self.fetch_ok)
        self.assertEqual(p["fetch_status"], "fresh-fetch")
        self.assertTrue((self.root / "data/medium-policy/CURRENT.json").exists())
        self.assertEqual(len(list((self.root / "data/medium-policy").glob("*.md"))), 1)

        def down():
            raise POL.PolicyError("offline")
        later = datetime.now(timezone.utc) + timedelta(days=2)
        q = POL.load_policy(self.root, now=later, fetch=down)
        self.assertEqual(q["fetch_status"], "cache-fallback")
        self.assertIn("offline", q["fetch_error"])
        self.assertEqual(q["policy_version"], p["policy_version"])

    def test_daily_refetch_limit(self):
        POL.load_policy(self.root, fetch=self.fetch_ok)
        q = POL.load_policy(self.root, fetch=self.fetch_ok)
        self.assertEqual((q["fetch_status"], self.n), ("cache-fresh", 1))

    def test_no_cache_and_offline_is_error_not_crash(self):
        def down():
            raise POL.PolicyError("offline")
        with self.assertRaises(POL.PolicyError):
            POL.load_policy(self.root, fetch=down)
        r = RV.run_review(self.ctx(), root=self.root, llm=Stub(good_reply()), fetch=down)
        self.assertEqual(r["status"], "ERROR")

    def test_review_uses_cached_policy_when_offline(self):
        POL.load_policy(self.root, fetch=self.fetch_ok)

        def down():
            raise POL.PolicyError("offline")
        r = RV.run_review(self.ctx(), root=self.root, llm=Stub(good_reply()), fetch=down)
        self.assertEqual(r["status"], "REVIEWED")

    def test_html_to_text_and_version(self):
        self.assertIn("## Boost", POL.html_to_text("<h2>Boost</h2><p>Hello <b>there</b></p><ul><li>one</li></ul>"))
        self.assertEqual(POL.policy_version("f" * 64, "2026-01-01"), "ffffffffffff@2026-01-01")


class Nightly(Base):
    def row(self, boost, cand, reads=None, title_chars=50):
        return {"review": {"boost_candidate": cand, "general_distribution_risk": "LOW", "weakest_dimension": "sourcing"},
                "title_features": {"title_chars": title_chars}, "outcomes": {"boost_observed": boost, "reads": reads}}

    def test_correlation_table_pure(self):
        rows = [self.row(True, "YES", 100), self.row(False, "YES", 20), self.row("unknown", "NO"), self.row(False, "NO", None, 120)]
        before = json.dumps(rows)
        t = NL.correlation_table(rows)
        self.assertEqual(json.dumps(rows), before)
        self.assertIn("Correlation, not causation", t["wording"])
        yes = t["tables"]["boost_candidate"]["YES"]
        self.assertEqual((yes["n"], yes["boost_rate_among_known"], yes["mean_reads"], yes["n_with_reads"]), (2, 0.5, 60, 2))
        no = t["tables"]["boost_candidate"]["NO"]
        self.assertEqual((no["n"], no["boost_observed"]["unknown"], no["mean_reads"]), (2, 1, None))
        self.assertEqual(t["tables"]["title_length"][">100"]["n"], 1)
        self.assertIn("Correlation, not causation", NL.to_markdown(t))

    def test_row_from_package_matches_schema_keys(self):
        RV.run_review(self.ctx(), root=self.root, llm=Stub(good_reply()), policy=POL_META)
        (self.pkg / "workflow.json").write_text(json.dumps({"status": "published", "boosted": True, "stats": {"views": 10, "claps": 3}}))
        row = NL.row_from_package(self.pkg, "2026-10-05T00:00:00Z")
        schema = json.loads((Path(__file__).resolve().parents[3] / "data/medium-policy/learning-row.schema.json").read_text())
        self.assertTrue(set(schema["required"]) <= set(row))
        self.assertTrue(set(row) <= set(schema["properties"]))
        self.assertIs(row["outcomes"]["boost_observed"], True)
        self.assertEqual((row["outcomes"]["views"], row["outcomes"]["reads"]), (10, None))
        self.assertEqual(row["outcomes"]["sources"]["views"], "workflow.json:stats.views")
        (self.pkg / "workflow.json").write_text(json.dumps({"status": "draft"}))
        self.assertIsNone(NL.row_from_package(self.pkg))


if __name__ == "__main__":
    unittest.main()
