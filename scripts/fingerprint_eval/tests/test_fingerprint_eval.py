import unittest

from scripts.fingerprint_eval import metrics as M
from scripts.fingerprint_eval.gateway import Model, family_of, resolve_model
from scripts.fingerprint_eval.guards import structure_preservation
from scripts.fingerprint_eval.rewrite import FamilyError, assert_different_family, rewrite_article, segment_article
from scripts.fingerprint_eval.textutil import core_markdown, html_to_text, parse_blocks, render_blocks

DOC = """# Title

Short hook line here for the reader today.

## Part one

This isn't a bug. It's a feature that hides in plain sight today. We tested it twice, and then we tested it again.

![alt text](assets/a.png)

- first item here
- second item here
- third item here

But the catch is real and worth stating clearly to everyone.

```python
x = 1
```

See the [source](https://example.com/a) for details about the measured effect in this section here.

## Conclusion

Final words go here and they close the piece out nicely for all readers.

## About the author

Boilerplate bio text that should be ignored by style measurement entirely.
"""


class MetricsTest(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(M.fingerprint(DOC), M.fingerprint(DOC))

    def test_histograms_normalised(self):
        fp = M.fingerprint(DOC)
        for k in ("sent_len_hist", "para_len_hist", "punct_dist"):
            self.assertAlmostEqual(sum(fp[k]), 1.0, places=6)

    def test_jsd_properties(self):
        p = [0.5, 0.5, 0.0]
        self.assertAlmostEqual(M.jsd(p, p), 0.0)
        self.assertAlmostEqual(M.jsd([1, 0], [0, 1]), 1.0)
        self.assertAlmostEqual(M.jsd([0.2, 0.8], [0.7, 0.3]), M.jsd([0.7, 0.3], [0.2, 0.8]))

    def test_cosine_and_delta(self):
        self.assertAlmostEqual(M.cosine_distance([1, 2], [2, 4]), 0.0)
        self.assertAlmostEqual(M.cosine_distance([1, 0], [0, 1]), 1.0)
        self.assertAlmostEqual(M.burrows_delta([1, 2], [3, 2], [0, 0], [1, 1]), 1.0)

    def test_em_dash_and_first_person(self):
        fp = M.fingerprint("I think this works — mostly. We saw it. Did you?")
        self.assertGreater(fp["em_dash_per_1k"], 0)
        self.assertGreater(fp["first_person_per_1k"], 0)
        self.assertGreater(fp["question_rate"], 0)

    def test_templates_found(self):
        t = M.detect_templates(DOC)
        self.assertIn("this_isnt_x_its_y", t)
        self.assertIn("hook_bullets_caveat_conclusion", t)
        self.assertIn("rule_of_three_lists", M.detect_templates("We ran, jumped, and swam all day long."))
        self.assertEqual(M.detect_templates("Plain sentence here. Another one follows it."), {})

    def test_repeated_ngrams(self):
        rep = M.fingerprint("the cat sat down. the cat sat down. the cat sat down.")["repeated_ngram_rate"]
        self.assertGreater(rep["3"], 0.5)
        self.assertEqual(M.fingerprint("one two three four five six seven eight")["repeated_ngram_rate"]["3"], 0.0)

    def test_shift_moves_toward_reference(self):
        ref = M.fingerprint("Short one. Tiny line. Done now.\n\nAnother short bit. Yes. No.")
        orig = M.fingerprint("This sentence is considerably longer than the reference sentences are, which makes the histogram differ a lot indeed, really, truly.")
        s = M.shift(ref, orig, ref)
        self.assertAlmostEqual(s["after"]["composite"], 0.0)
        self.assertGreater(s["before"]["composite"], 0.0)
        self.assertLess(s["delta"]["composite"], 0.0)

    def test_core_markdown_drops_boilerplate(self):
        self.assertNotIn("Boilerplate", core_markdown(DOC))
        self.assertIn("Final words", core_markdown(DOC))


class FamilyGuardTest(unittest.TestCase):
    def test_same_family_rejected(self):
        with self.assertRaises(FamilyError):
            assert_different_family("openai", "OpenAI")

    def test_unknown_rejected(self):
        with self.assertRaises(FamilyError):
            assert_different_family("openai", "unknown")

    def test_different_ok(self):
        assert_different_family("openai", "alibaba-qwen")

    def test_family_of(self):
        self.assertEqual(family_of("qwen3:8b"), "alibaba-qwen")
        self.assertEqual(family_of("gemma4"), "google")
        self.assertEqual(resolve_model("codex").family, "openai")
        self.assertEqual(resolve_model("claude:sonnet").family, "anthropic")

    def test_rewrite_article_enforces_guard_unless_control(self):
        segs = segment_article(DOC)
        same = Model("gpt-x", "gateway", "gpt-x")
        with self.assertRaises(FamilyError):
            rewrite_article(DOC, same, "openai", segs)
        # control lane: guard bypassed explicitly; no propositions => everything passes through verbatim
        self.assertEqual(rewrite_article(DOC, same, "openai", segs, control=True).strip(), render_blocks(parse_blocks(DOC)).strip())


class PreservationTest(unittest.TestCase):
    def test_roundtrip_blocks(self):
        self.assertEqual(render_blocks(parse_blocks(DOC)).strip(), DOC.strip())

    def test_frozen_segments_cover_structure(self):
        segs = segment_article(DOC)
        frozen = "\n\n".join(s.text for s in segs if s.frozen)
        for needle in ("![alt text](assets/a.png)", "```python", "## Part one", "- first item here", "Boilerplate"):
            self.assertIn(needle, frozen)

    def test_preservation_detects_losses(self):
        self.assertTrue(structure_preservation(DOC, DOC)["all_preserved"])
        no_link = DOC.replace("[source](https://example.com/a)", "source")
        r = structure_preservation(DOC, no_link)
        self.assertFalse(r["links"]["preserved"])
        self.assertFalse(r["all_preserved"])
        self.assertFalse(structure_preservation(DOC, DOC.replace("![alt text](assets/a.png)", ""))["images"]["preserved"])
        self.assertFalse(structure_preservation(DOC, DOC.replace("## Conclusion", "## Ending"))["headings"]["preserved"])
        self.assertFalse(structure_preservation(DOC, DOC.replace("x = 1", "x = 2"))["codes"]["preserved"])

    def test_html_to_text(self):
        html = '<html><body><section data-field="body" class="e-content"><section><h3>Head</h3><p>Body para one.</p><ul><li>a</li><li>b</li></ul></section></section></article></body></html>'
        t = html_to_text(html)
        self.assertIn("## Head", t)
        self.assertIn("- a\n- b", t)


class GatewayUrlTest(unittest.TestCase):
    def test_base_url_gets_v1_suffix(self):
        from scripts.fingerprint_eval.gateway import normalize_base_url
        self.assertEqual(normalize_base_url("https://llm.maxpetrusenko.com"), "https://llm.maxpetrusenko.com/v1")
        self.assertEqual(normalize_base_url("https://llm.maxpetrusenko.com/"), "https://llm.maxpetrusenko.com/v1")
        self.assertEqual(normalize_base_url("https://llm.maxpetrusenko.com/v1"), "https://llm.maxpetrusenko.com/v1")


class MetaClaimTest(unittest.TestCase):
    def test_discourse_claims_are_filtered(self):
        from scripts.fingerprint_eval.rewrite import is_meta_claim
        self.assertTrue(is_meta_claim("The passage moves to a smaller scale of example."))
        self.assertTrue(is_meta_claim("The passage's medical-news section continues the same argument."))
        self.assertFalse(is_meta_claim("The passage describes the result: a handle on an undruggable target."))
        self.assertFalse(is_meta_claim("The hippocampus replays the day during sleep."))
        self.assertFalse(is_meta_claim("Medicine repeatedly runs into this blind spot."))


if __name__ == "__main__":
    unittest.main()
