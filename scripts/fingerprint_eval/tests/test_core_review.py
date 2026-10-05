"""Regression tests for the Codex review of the gate core: markdown parsing, added-claim gaps, section keys, env hygiene, partial FAIL."""
import json
import unittest
from unittest import mock

from scripts.fingerprint_eval import added, run as RUN
from scripts.fingerprint_eval.errors import EvaluationError
from scripts.fingerprint_eval.guards import sections, semantic_similarity, structure_preservation
from scripts.fingerprint_eval.refs import find_refs
from scripts.fingerprint_eval.textutil import parse_blocks, strip_inline
from scripts.fingerprint_eval.tests.fakes import ARTICLE, Fakes, gate_json, workspace

import tempfile
from pathlib import Path


class CommonMarkBlocks(unittest.TestCase):
    def kinds(self, md):
        return [(b.kind, b.text) for b in parse_blocks(md)]

    def test_setext_headings_are_headings(self):
        got = self.kinds("Title\n=====\n\nIntro text here.\n\nSection two\n-----------\n\nBody.\n")
        self.assertEqual([k for k, _ in got], ["heading", "paragraph", "heading", "paragraph"])
        self.assertEqual([t for k, t in got if k == "heading"], ["# Title", "## Section two"])

    def test_gfm_tables_all_shapes(self):
        for tbl in ("| a | b |\n|---|---|\n| 1 | 2 |", "a | b\n--|--\n1 | 2", "| a | b |\n| :-- | --: |\n| 1 \\| x | 2 |", "a | b\n---|---\n1 | 2\n3 | 4"):
            got = self.kinds("Before the table.\n\n" + tbl + "\n\nAfter the table.")
            self.assertEqual([k for k, _ in got], ["paragraph", "table", "paragraph"], tbl)
            self.assertEqual(got[1][1], tbl)

    def test_html_img_only_block_is_an_image(self):
        self.assertEqual([k for k, _ in self.kinds('<img src="a.png" alt="x">')], ["image"])
        self.assertEqual([k for k, _ in self.kinds('<p>Hello <a href="http://e.com">there</a></p>')], ["paragraph"])

    def test_image_only_paragraph_and_fences(self):
        self.assertEqual([k for k, _ in self.kinds("![a](b.png)\n\n~~~py\nx = 1\n~~~\n\n    indented code\n")], ["image", "code", "code"])

    def test_strip_inline_uses_the_parser(self):
        self.assertEqual(strip_inline("A [link][ref] with `code`, *em* and <b>bold</b> ![img](x.png).\n\n[ref]: http://e.com"), "A link with code, em and bold .")
        self.assertEqual(strip_inline("keep `a_b` and snake_case_name"), "keep a_b and snake_case_name")


class CommonMarkRefs(unittest.TestCase):
    def test_shortcut_and_collapsed_reference_links(self):
        t = "See [docs] and [other][] and [full][d].\n\n[docs]: http://e.com/1\n[other]: http://e.com/2\n[d]: http://e.com/3\n"
        self.assertEqual(find_refs(t)["links"], ["[docs](http://e.com/1)", "[other](http://e.com/2)", "[full](http://e.com/3)"])
        lost = structure_preservation(t, t.replace("[docs]", "docs"))["links"]
        self.assertFalse(lost["preserved"])
        # a definition that went missing turns the reference into literal text: the link is lost
        self.assertFalse(structure_preservation(t, t.replace("[docs]: http://e.com/1\n", ""))["links"]["preserved"])

    def test_inline_code_and_fences_hide_links(self):
        t = "Use `[x](http://e.com/a)` and `http://e.com/b`.\n\n```\n[y](http://e.com/c)\n```\n\n    [z](http://e.com/d)\n"
        self.assertEqual(find_refs(t), {"images": [], "links": []})

    def test_html_a_and_img_tags(self):
        t = 'Text <a href="http://e.com/a">here</a> and <img src="p.png"> inline.\n\n<img src="q.png">\n\n<a href="http://e.com/b">block</a>\n'
        r = find_refs(t)
        self.assertEqual(r["images"], ['<img src="p.png">', '<img src="q.png">'])
        self.assertEqual(r["links"], ['<a href="http://e.com/a">', '<a href="http://e.com/b">'])
        self.assertFalse(structure_preservation(t, t.replace("<img src=\"p.png\">", ""))["images"]["preserved"])

    def test_links_inside_every_gfm_table_shape_and_lists_and_quotes(self):
        for tbl in ("| a | b |\n|---|---|\n| [l](http://e.com/t) | 2 |", "a | b\n--|--\n[l](http://e.com/t) | 2"):
            self.assertEqual(find_refs("Intro.\n\n" + tbl)["links"], ["[l](http://e.com/t)"], tbl)
        self.assertEqual(find_refs("- item [l](http://e.com/l)\n\n> quote [q](http://e.com/q)")["links"], ["[l](http://e.com/l)", "[q](http://e.com/q)"])
        self.assertFalse(structure_preservation("a | b\n--|--\n[l](http://e.com/t) | 2", "a | b\n--|--\nl | 2")["links"]["preserved"])

    def test_setext_heading_preserved_check(self):
        o = "Title\n=====\n\nBody.\n\nSub\n---\n\nMore.\n"
        self.assertTrue(structure_preservation(o, o)["headings"]["preserved"])
        self.assertFalse(structure_preservation(o, o.replace("Sub\n---\n\n", ""))["headings"]["preserved"])


class AddedSentences(unittest.TestCase):
    REF = "The reactor ran for forty days without a single fault. It was inspected twice by the crew."

    def new(self, final):
        return sum(added.new_sentences(self.REF, final).values(), [])

    def test_short_sentences_with_digit_proper_noun_or_negation_count(self):
        for s in ("It cost 40 dollars.", "It's Boeing's design.", "It did not fail.", "Nobody objected.", "They never agreed."):
            self.assertIn(s, self.new(self.REF + " " + s), s)

    def test_short_fragments_are_stylistic_only_when_every_token_is_in_the_reference_section(self):
        self.assertEqual(self.new(self.REF + " Inspected."), [])  # one content token, in the section
        self.assertEqual(added.new_sentences("Notice the fault.", "Notice the fault. Notice it."), {})  # pure rhythm fragment
        self.assertTrue(self.new(self.REF + " Crew inspected."))  # two reused tokens can recombine into a claim: checked
        self.assertEqual(self.new(self.REF + " ..."), [])  # no content token
        self.assertEqual(self.new(self.REF + " Notice, decide, and remember."), ["Notice, decide, and remember."])
        self.assertEqual(self.new(self.REF + " They won."), ["They won."])

    def test_reused_vocabulary_recombination_is_checked_and_unsupported_fails(self):
        ref = "The patient ran for forty days. Doctors inspected the patient twice."
        final = ref + " The patient died."
        self.assertIn("The patient died.", sum(added.new_sentences(ref, final).values(), []))
        f = Fakes()
        f.judge_reply = lambda prompt: json.dumps([{"i": 1, "verdict": "unsupported", "reason": "new fact"}])
        with f:
            res = added.check_added(ref, final, None, "claude:sonnet", "claude:sonnet")
        self.assertEqual([u["claim"] for u in res["unsupported"]], ["The patient died."])
        self.assertEqual(f.calls["judge"], 1)  # batched: one judge call per section

    def test_fuzzy_match_with_changed_number_negation_or_entity_is_new(self):
        for old, new in (("forty days", "fourteen days"), ("for forty days", "for 40 days"), ("ran for forty days without", "did not run for forty days without"),
                         ("inspected twice by the crew", "inspected twice by the Navy crew")):
            changed = self.REF.replace(old, new)
            self.assertTrue(self.new(changed), (old, new))
        self.assertEqual(self.new(self.REF.replace("by the crew", "by the crew.")), [])  # untouched sentences still match

    def test_unchanged_text_has_nothing_new(self):
        self.assertEqual(self.new(self.REF), [])

    def test_empty_extraction_from_new_factual_sentences_is_malformed_output_error(self):
        f = Fakes()
        f.extract_reply = lambda prompt: json.dumps({"role": "r", "propositions": []})
        with f:
            with self.assertRaises(EvaluationError) as cm:
                added.check_added(self.REF, self.REF + " The reactor leaked 12 liters of coolant.", None, "claude:sonnet", "claude:sonnet")
        self.assertEqual(cm.exception.category.value, "MALFORMED_MODEL_OUTPUT")


class SectionKeys(unittest.TestCase):
    DOC = "## Notes\n\nFirst notes paragraph about apples.\n\n## Notes\n\nSecond notes paragraph about oranges.\n"

    def test_duplicate_headings_do_not_collapse(self):
        s = sections(self.DOC)
        self.assertEqual([k for k, _ in s], ["Notes", "Notes #2"])
        self.assertEqual(len(s), 2)

    def test_second_duplicate_removed_scores_zero_and_unmatched_rewrite_counts_toward_whole(self):
        with Fakes():
            r = semantic_similarity(self.DOC, "## Notes\n\nFirst notes paragraph about apples.\n")
            self.assertEqual(r["per_section"]["Notes #2"], 0.0)
            same = semantic_similarity(self.DOC, self.DOC)["whole"]
            self.assertLess(r["whole"], same)  # the dropped second section is part of the whole-document score
            added_sec = semantic_similarity("## A\n\nOnly the original section lives here.\n", "## A\n\nOnly the original section lives here.\n\n## Extra\n\nA completely different invented section about spaceships and tax law.\n")
        self.assertEqual(added_sec["unmatched_rewrite_sections"], ["Extra"])
        self.assertLess(added_sec["whole"], 0.99)


class ChildEnv(unittest.TestCase):
    def test_doppler_child_gets_only_the_allowlist(self):
        seen = {}

        def fake_run(cmd, **kw):
            seen["cmd"], seen["env"] = cmd, kw["env"]
            return mock.Mock(returncode=0, stdout="gw-key\n", stderr="")
        env = {"PATH": "/bin", "HOME": "/h", "USER": "u", "LANG": "C", "DOPPLER_TOKEN": "dt", "OPENAI_API_KEY": "o", "ANTHROPIC_API_KEY": "a",
               "GITHUB_TOKEN": "g", "AWS_SECRET_ACCESS_KEY": "s", "HTTPS_PROXY": "http://p"}
        with mock.patch.dict("os.environ", env, clear=True), mock.patch.object(RUN.subprocess, "run", fake_run):
            RUN.load_gateway_key()
            import os
            self.assertEqual(os.environ["LLM_GATEWAY_API_KEY"], "gw-key")
        self.assertEqual(seen["cmd"][0], "doppler")
        for bad in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY"):
            self.assertNotIn(bad, seen["env"])
        self.assertEqual((seen["env"]["DOPPLER_TOKEN"], seen["env"]["HTTPS_PROXY"]), ("dt", ""))

    def test_authz_git_child_env_has_no_secrets(self):
        from scripts.fingerprint_eval import authz
        seen = {}

        def fake_run(cmd, **kw):
            seen["env"] = kw["env"]
            return mock.Mock(returncode=0, stdout="abc\n", stderr="")
        with mock.patch.dict("os.environ", {"PATH": "/bin", "HOME": "/h", "OPENAI_API_KEY": "o", "ANTHROPIC_API_KEY": "a"}, clear=True), \
                mock.patch.object(authz.subprocess, "run", fake_run):
            authz._git("rev-parse", "HEAD")
        self.assertFalse({"OPENAI_API_KEY", "ANTHROPIC_API_KEY"} & set(seen["env"]))


class PartialGate(unittest.TestCase):
    def test_deterministic_fail_is_labelled_partial(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            w = workspace(root, ARTICLE.replace("## Part two", "## Renamed"), ARTICLE)
            from scripts.fingerprint_eval.run import main
            from scripts.fingerprint_eval.tests.fakes import argv
            with Fakes():
                rc = main(argv(w))
            g = gate_json(w)
        self.assertEqual(rc, 1)
        self.assertEqual((g["evaluated"], g["checks_skipped"], g["pass"], g["result"]), ("partial", ["claims", "semantic"], False, "FAIL"))

    def test_partial_cannot_pass(self):
        from scripts.fingerprint_eval import gate
        with self.assertRaises(EvaluationError):
            gate._verdict("s", 0.9, [], [], {"reference_identical": False}, "x", "skipped", "j", {}, {"whole": None}, {}, [], {}, partial=True)


if __name__ == "__main__":
    unittest.main()
