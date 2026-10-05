import math
import unittest
from unittest import mock

from scripts.fingerprint_eval import gateway as G
from scripts.fingerprint_eval import metrics as M
from scripts.fingerprint_eval.guards import structure_preservation
from scripts.fingerprint_eval.judge import parse_verdicts
from scripts.fingerprint_eval.refs import find_refs
from scripts.fingerprint_eval.rewrite import FamilyError, assert_same_family, rewrite_article, segment_article
from scripts.fingerprint_eval.run import run_rewriter

SECRETS = {"ANTHROPIC_API_KEY": "a", "ANTHROPIC_AUTH_TOKEN": "a", "OPENAI_API_KEY": "o", "LLM_GATEWAY_API_KEY": "g", "DOPPLER_TOKEN": "d", "AWS_SECRET_ACCESS_KEY": "s", "GITHUB_TOKEN": "t"}
BASE = {"PATH": "/bin", "HOME": "/h", "USER": "u", "LANG": "C", "TERM": "xterm", "CLAUDE_CODE_OAUTH_TOKEN": "sub", "CODEX_HOME": "/c"}


class ChildEnv(unittest.TestCase):
    def test_claude_env_keeps_subscription_auth_drops_secrets(self):
        e = G.claude_env({**BASE, **SECRETS})
        self.assertEqual(e["CLAUDE_CODE_OAUTH_TOKEN"], "sub")
        for k in ("PATH", "HOME", "USER", "LANG", "TERM"):
            self.assertIn(k, e)
        self.assertFalse(set(SECRETS) & set(e))
        self.assertNotIn("CODEX_HOME", e)

    def test_codex_env_minimal(self):
        e = G.codex_env({**BASE, **SECRETS})
        self.assertFalse(set(SECRETS) & set(e))
        self.assertNotIn("CLAUDE_CODE_OAUTH_TOKEN", e)
        self.assertEqual(e["CODEX_HOME"], "/c")

    def test_children_really_receive_the_allowlisted_env(self):
        seen = {}
        def fake_run(cmd, **kw):
            seen["env"] = kw["env"]
            return mock.Mock(returncode=0, stdout="ok", stderr="")
        with mock.patch.dict("os.environ", {**BASE, **SECRETS}, clear=True), mock.patch.object(G.subprocess, "run", fake_run):
            G.claude_cli("p")
        self.assertFalse(set(SECRETS) & set(seen["env"]))
        self.assertIn("CLAUDE_CODE_OAUTH_TOKEN", seen["env"])

    def test_timeout_and_missing_binary_become_gateway_errors(self):
        for exc in (G.subprocess.TimeoutExpired("c", 1), FileNotFoundError("claude")):
            with mock.patch.object(G.subprocess, "run", side_effect=exc), self.assertRaises(G.GatewayError):
                G.claude_cli("p")


class Embeddings(unittest.TestCase):
    def post(self, data):
        return mock.patch.object(G, "_post", return_value=data)

    def item(self, i, v):
        return {"index": i, "embedding": v}

    def test_valid(self):
        with self.post({"data": [self.item(1, [0, 1.0]), self.item(0, [1.0, 0])]}):
            self.assertEqual(G.embed(["a", "b"]), [[1.0, 0], [0, 1.0]])

    def test_rejects_bad_responses(self):
        bad = {
            "count": {"data": [self.item(0, [1.0, 2.0])]},
            "dims": {"data": [self.item(0, [1.0, 2.0]), self.item(1, [1.0])]},
            "nan": {"data": [self.item(0, [1.0, math.nan]), self.item(1, [1.0, 2.0])]},
            "inf": {"data": [self.item(0, [1.0, math.inf]), self.item(1, [1.0, 2.0])]},
            "zero": {"data": [self.item(0, [0.0, 0.0]), self.item(1, [1.0, 2.0])]},
            "index": {"data": [self.item(0, [1.0, 2.0]), self.item(5, [1.0, 2.0])]},
            "string": {"data": [self.item(0, ["a", "b"]), self.item(1, [1.0, 2.0])]},
            "shape": {"nope": 1},
        }
        for name, d in bad.items():
            with self.subTest(name), self.post(d), self.assertRaises(G.GatewayError):
                G.embed(["a", "b"])

    def test_nonfinite_similarity_rejected(self):
        from scripts.fingerprint_eval.errors import EvaluationError
        from scripts.fingerprint_eval.guards import _cos
        with self.assertRaises(EvaluationError):
            _cos([1.0, 2.0], [1.0])
        with self.assertRaises(EvaluationError):
            _cos([1e308, 1e308], [1e308, 1e308])  # overflow -> inf/nan


class JudgeParser(unittest.TestCase):
    OK = '[{"i": 1, "verdict": "entailed", "reason": "x"}, {"i": 2, "verdict": "changed"}]'

    def test_accepts_plain_and_one_fence(self):
        self.assertEqual(set(parse_verdicts(self.OK, 2)), {1, 2})
        self.assertEqual(set(parse_verdicts("```json\n" + self.OK + "\n```", 2)), {1, 2})

    def test_rejects(self):
        bad = ["note: " + self.OK, self.OK + " thanks", "```json\n" + self.OK + "\n``` extra", '{"i": 1}', "[]",
               '[{"i": 1, "verdict": "entailed"}]', '[{"i": 1, "verdict": "entailed"}, {"i": 1, "verdict": "entailed"}]',
               '[{"i": 1, "verdict": "entailed"}, {"i": 2, "verdict": "ok"}]',
               '[{"i": 1, "verdict": "entailed"}, {"i": 2, "verdict": "missing"}, {"i": 3, "verdict": "missing"}]',
               '[{"i": "1", "verdict": "entailed"}, {"i": 2, "verdict": "missing"}]',
               '[{"i": true, "verdict": "entailed"}, {"i": 2, "verdict": "missing"}]',
               '[{"i": 1, "verdict": "entailed", "evil": 1}, {"i": 2, "verdict": "missing"}]', ""]
        for b in bad:
            with self.subTest(b[:40]), self.assertRaises(ValueError):
                parse_verdicts(b, 2)


class Control(unittest.TestCase):
    DOC = "# T\n\n## S\n\nShort.\n"

    def test_assert_same_family(self):
        assert_same_family("openai", "OpenAI")
        for w, r in (("openai", "anthropic"), ("unknown", "unknown"), ("", "openai")):
            with self.assertRaises(FamilyError):
                assert_same_family(w, r)

    def test_control_rewrite_requires_same_family(self):
        segs = segment_article(self.DOC)
        with self.assertRaises(FamilyError):
            rewrite_article(self.DOC, G.resolve_model("claude:sonnet"), "openai", segs, control=True)
        rewrite_article(self.DOC, G.resolve_model("codex"), "openai", segs, control=True)

    def test_run_rewriter_control_checks_family_before_any_call(self):
        with self.assertRaises(FamilyError):
            run_rewriter("claude:sonnet", self.DOC, [], {"model": "codex", "family": "openai"}, {}, None, None, control=True)


class RefsAndStructure(unittest.TestCase):
    def lost(self, orig, new, key):
        r = structure_preservation(orig, new)
        return r[key]

    def test_inline_image_mid_line(self):
        t = "Text before ![chart](a.png) text after."
        self.assertEqual(find_refs(t)["images"], ["![chart](a.png)"])
        r = self.lost(t, "Text before text after.", "images")
        self.assertFalse(r["preserved"]); self.assertEqual(r["missing"], ["![chart](a.png)"])

    def test_reference_style_image_and_links_and_definitions(self):
        t = "See [the docs][d] and ![pic][p].\n\n[d]: https://example.com/docs\n[p]: https://example.com/p.png\n"
        refs = find_refs(t)
        self.assertEqual(refs["images"], ["![pic](https://example.com/p.png)"])
        self.assertEqual(refs["links"], ["[the docs](https://example.com/docs)"])
        self.assertFalse(self.lost(t, t.replace("[the docs][d]", "the docs"), "links")["preserved"])
        self.assertFalse(self.lost(t, t.replace("[d]: https://example.com/docs\n", ""), "links")["preserved"])
        self.assertFalse(self.lost(t, t.replace("![pic][p]", ""), "images")["preserved"])

    def test_autolink(self):
        t = "Read <https://example.com/a> now."
        self.assertEqual(find_refs(t)["links"], ["<https://example.com/a>"])
        self.assertFalse(self.lost(t, "Read it now.", "links")["preserved"])

    def test_bare_url(self):
        t = "Go to https://example.com/x, then stop."
        self.assertEqual(find_refs(t)["links"], ["https://example.com/x"])
        self.assertFalse(self.lost(t, "Go there, then stop.", "links")["preserved"])

    def test_no_double_counting_and_code_ignored(self):
        t = "A [l](https://e.com/a) and <https://e.com/b> ok.\n\n```\n![x](y) https://e.com/c\n```\n\nUse `https://e.com/d`."
        self.assertEqual(find_refs(t)["links"], ["[l](https://e.com/a)", "<https://e.com/b>"])
        self.assertEqual(find_refs(t)["images"], [])

    def test_inline_link_still_detected(self):
        t = "See [source](https://example.com/a) here."
        self.assertFalse(self.lost(t, "See source here.", "links")["preserved"])
        self.assertTrue(structure_preservation(t, t)["all_preserved"])


class MetricsValidation(unittest.TestCase):
    def test_length_mismatch_raises(self):
        for fn in (M.jsd, M.cosine_distance):
            with self.assertRaises(ValueError):
                fn([0.5, 0.5], [1.0])
        with self.assertRaises(ValueError):
            M.burrows_delta([1, 2], [1, 2, 3], [0, 0], [1, 1])

    def test_nonfinite_raises(self):
        with self.assertRaises(ValueError):
            M.jsd([math.nan, 1.0], [0.5, 0.5])
        with self.assertRaises(ValueError):
            M.cosine_distance([math.inf, 1.0], [1.0, 1.0])

    def test_zero_vector_cosine(self):
        self.assertEqual(M.cosine_distance([0, 0], [0, 0]), 0.0)
        self.assertEqual(M.cosine_distance([0, 0], [1, 0]), 1.0)


if __name__ == "__main__":
    unittest.main()
