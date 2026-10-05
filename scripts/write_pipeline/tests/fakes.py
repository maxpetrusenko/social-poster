"""Offline stand-ins: a runner that answers for the evaluator CLIs, a scriptable critic, and a driver that walks the pipeline."""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import struct
import zlib
from pathlib import Path

from scripts.fingerprint_eval.contracts import Category
from scripts.fingerprint_eval.gateway import GatewayError
from scripts.write_pipeline import cli

URL = "https://example.com/lab-report"
SOURCE_TEXT = ("Transcript excerpt. The lab ran the test on 40 nodes in 2025. Median latency fell from 120 ms to 85 ms after the change. "
               "The team said the cache was the cause. The report is at https://example.com/lab-report.\n")
DRAFT = """# Why the cache change cut latency

A lab ran a latency test on 40 nodes in 2025 and published the numbers in its [test report](https://example.com/lab-report). Median latency fell from 120 ms to 85 ms after the change.

## What the test measured

The report describes the setup in plain terms. Each node served the same request mix before and after the change, and the team compared medians. The authors attribute the drop to the cache, according to the report, and they say nothing about other workloads.

## What the numbers leave open

The report covers one workload on one fleet. A reader with a different request mix should rerun the comparison before relying on the figure. The team has not published tail latency, so the median alone cannot say whether the slowest requests improved.
"""
EDITORIAL = DRAFT.replace("The report describes the setup in plain terms.", "The report describes the setup briefly.")
VOICE = EDITORIAL.replace("A reader with a different request mix should rerun", "Anyone with a different request mix should rerun")
GENERIC = """# Why the cache change cut latency

This isn't just a cache tweak, it's a paradigm shift. The landscape of latency is robust and holistic.

This isn't about speed. It's about trust in a seamless realm of tapestry.

Here's the thing: the lab ran a test on 40 nodes in 2025 at [the report](https://example.com/lab-report). Latency fell from 120 ms to 85 ms.

## What the test measured

This isn't a benchmark, it's a testament. It delves into crucial and pivotal results, and it unlocks a seamless way to leverage the cache.

## What the numbers leave open

This isn't a limit. It's an opportunity. Let's be honest: what this really means is a robust, holistic, seamless path.
"""


UNSLOP = {"unslop": {"applied": True, "prose_checker": "ran"}}


def sha(b: bytes | str) -> str:
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()


def png(path: Path, w: int = 1280, h: int = 720, tint: int = 7) -> None:
    raw = b"".join(b"\x00" + bytes([tint, 90, 140]) * w for _ in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def resign_state(pkg: Path, mutate) -> None:
    """Edit state.json the way a holder of the record key would: mutate, then re-sign every record and the state."""
    from scripts.fingerprint_eval import record as R
    p = Path(pkg) / "write-pipeline" / "state.json"
    s = json.loads(p.read_text())
    mutate(s)
    for r in s["stages"].values():
        r[R.SIG_FIELD] = R.sign(r)
    s[R.SIG_FIELD] = R.sign(s)
    p.write_text(json.dumps(s))


GATE_REC = "evals/fake-gate-record.json"


def fake_record_check(pkg, final_sha):
    """Stand-in for the evaluator's signed gate record check: the record must carry a valid record-key HMAC, PASS, and these bytes."""
    from scripts.fingerprint_eval import record as R
    d = json.loads((Path(pkg) / GATE_REC).read_text())
    R.check_signature(d, "gate record")
    if d.get("result") != "PASS" or d.get("content_sha256") != final_sha:
        raise R.RecordError("gate record is not PASS for these bytes")


class Runner:
    """Answers the evaluator CLIs the pipeline calls. Every call is recorded in .calls as (module, argv)."""

    def __init__(self):
        self.calls: list[tuple[str, list[str]]] = []
        self.gate = "PASS"            # PASS | FAIL | ERROR
        self.gate_cats: list[str] = []
        self.forbidden: list[str] = []  # phrases that make the claims gate see a changed claim
        self.required: list[str] = []   # phrases whose deletion makes the gate see a missing claim
        self.paraphrases: list[str] = []  # phrases that make the unresolved-claims reference look entailed by the text (a paraphrase survived)
        self.unresolved_runs = 0
        self.unresolved_error = False
        self.unresolved_cats = ["CONTENT_CLAIM_FAILURE"]  # categories of the FAIL the unresolved-claims check sees when the text is clean
        self.authorize_rc = 0
        self.authorize_seen: list[str] = []  # sha256 of FINAL.md at the moment each authorize call ran
        self.verify_sha: str | None = None
        self.review_rc = 0
        self.route = {"route_code": "A", "route": "DIRECT_PUBLISH", "detail": "A_DIRECT_PUBLISH", "reasons": [], "publication_candidates": []}

    def n(self, module: str) -> int:
        return sum(1 for m, _ in self.calls if m == module)

    def __call__(self, argv: list[str]) -> tuple[int, str]:
        mod = argv[2]
        self.calls.append((mod, argv))
        arg = lambda k: argv[argv.index(k) + 1]  # noqa: E731
        if mod == "scripts.fingerprint_eval.run":
            out = Path(arg("--out"))
            art, ref = Path(arg("--article")).read_text(), Path(arg("--draft")).read_text()
            state, cats = self.gate, list(self.gate_cats)
            if "/work/unresolved/" in arg("--draft"):  # unresolved-claims reference: a clean text has every claim MISSING (FAIL)
                state, cats = ("PASS", []) if any(p in art for p in self.paraphrases) else ("FAIL", list(self.unresolved_cats))
                self.unresolved_runs += 1
                if self.unresolved_error:
                    state = "ERROR"
            if any(p in art for p in self.forbidden):
                state, cats = "FAIL", ["CONTENT_CLAIM_FAILURE"]
            if any(p in ref and p not in art for p in self.required):
                state, cats = "FAIL", ["CONTENT_CLAIM_FAILURE"]
            if state == "ERROR":
                return 2, "GATE ERROR"
            g = {"pass": state == "PASS", "evaluated": True, "exit_code": 0 if state == "PASS" else 1, "failure_categories": cats,
                 "reasons": [] if state == "PASS" else [f"claims changed={len(cats)}"]}
            out.mkdir(parents=True, exist_ok=True)
            (out / "gate.json").write_text(json.dumps(g))
            return g["exit_code"], ""
        if mod == "scripts.fingerprint_eval.release" and argv[3] == "authorize":
            pkg = Path(arg("--package"))
            self.authorize_seen.append(sha((pkg / "FINAL.md").read_bytes()))
            if self.authorize_rc == 0:
                from scripts.fingerprint_eval import record as R
                (pkg / GATE_REC).parent.mkdir(parents=True, exist_ok=True)
                (pkg / GATE_REC).write_text(json.dumps(R.signed({"result": "PASS", "content_sha256": sha((pkg / "FINAL.md").read_bytes())})))
            if self.authorize_rc == 3:
                (pkg / "QUARANTINE.json").write_text(json.dumps({"category": "CONTENT_CLAIM_FAILURE", "kind": "content", "retryable": False}))
            if self.authorize_rc == 4:
                (pkg / "QUARANTINE.json").write_text(json.dumps({"category": "DEPENDENCY_FAILURE", "kind": "infra", "retryable": True}))
            return self.authorize_rc, "authorize"
        if mod == "scripts.fingerprint_eval.release" and argv[3] == "verify":
            final = (Path(arg("--package")) / "FINAL.md").read_bytes()
            s = self.verify_sha or sha(final)
            return 0, json.dumps({"valid": True, "reason": "authorized", "content_sha256": s})
        if mod == "scripts.medium_review":
            art = Path(arg("--article"))
            if self.review_rc:
                return self.review_rc, json.dumps({"status": "ERROR", "error": "rate limit reached"})
            return 0, json.dumps({"status": "REVIEWED", "binding": {"content_sha256": sha(art.read_bytes()), "policy_version": "p1"},
                                  "scorecard": {"boost_candidate": "NO", "general_distribution_risk": "LOW", "weakest_dimension": "originality"},
                                  "author_input_required": {"required": False}, "disclaimer": "advisory"})
        if mod == "scripts.publish_route" and argv[3] == "verify":
            from scripts.publish_route.orchestrate import _canon
            try:
                rec = json.loads((Path(arg("--package")) / "evals/publish-route/route.json").read_text())
            except (OSError, ValueError):
                return 1, "route.json missing"
            ok = rec.get("route_sha256") == sha(_canon(rec)) and rec["binding"]["content_sha256"] == sha(Path(arg("--article")).read_bytes())
            return (0 if ok else 1), "verify"
        if mod == "scripts.publish_route":
            from scripts.publish_route.orchestrate import _canon
            rec = {**self.route, "binding": {"content_sha256": sha(Path(arg("--article")).read_bytes())}}
            rec["route_sha256"] = sha(_canon(rec))
            rp = Path(arg("--package")) / "evals/publish-route/route.json"
            rp.parent.mkdir(parents=True, exist_ok=True)
            rp.write_text(json.dumps(rec, indent=2, sort_keys=True))
            return 0, json.dumps(self.route)
        raise AssertionError(f"unexpected call {argv}")


class Critic:
    def __init__(self):
        self.replies: list = []
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> str:
        self.prompts.append(prompt)
        r = self.replies.pop(0) if self.replies else {"verdict": "pass", "findings": []}
        if isinstance(r, Exception):
            raise r
        return r if isinstance(r, str) else json.dumps(r)


def unavailable() -> GatewayError:
    return GatewayError("claude -p rate limit reached", Category.MODEL_UNAVAILABLE, "claude-cli")


class Driver:
    def __init__(self, tmp: Path, monkeypatch=None):
        self.tmp = tmp
        self.pkg = tmp / "pkg"
        self.inbox = tmp / "inbox"
        self.inbox.mkdir(exist_ok=True)
        self.fw = tmp / "FRAMEWORK.md"
        self.fw.write_text("# framework v6 (test copy)\n")
        self.runner, self.critic = Runner(), Critic()
        self.last_rc = 0
        self.texts = {"draft": DRAFT, "validate": DRAFT, "editorial": EDITORIAL, "voice": VOICE}

    def same_text(self, t: str):
        self.texts = dict.fromkeys(("draft", "validate", "editorial", "voice"), t)
        return self

    def cli(self, *args: str):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main([*args, "--package", str(self.pkg)] if args[0] != "init" else [*args, "--package", str(self.pkg), "--framework", str(self.fw)],
                          runner=self.runner, critic=self.critic)
        self.last_rc = rc
        out = buf.getvalue()
        try:
            return rc, json.loads(out)
        except ValueError:
            return rc, out

    def write(self, name: str, content) -> Path:
        p = self.inbox / name
        p.write_text(content if isinstance(content, str) else json.dumps(content))
        return p

    def submit(self, stage: str, content, report=None, name=None):
        f = self.write(name or f"{stage}.{'json' if not isinstance(content, str) or stage in ('source', 'research', 'angle', 'outline', 'title', 'images') else 'md'}", content)
        args = ["submit", stage, "--file", str(f)]
        if report is not None:
            args += ["--report", str(self.write(f"{stage}.report.json", report))]
        return self.cli(*args)

    # ---- good artifacts ----------------------------------------------------------------------------------------
    def sources(self):
        (self.pkg / "sources").mkdir(parents=True, exist_ok=True)
        (self.pkg / "sources" / "source-001.md").write_text(SOURCE_TEXT)
        return {"sources": [{"id": "s1", "kind": "transcript", "status": "captured", "file": "sources/source-001.md"}]}

    EVIDENCE = {"research_delta": "The report scopes the result to one workload; that limit changes how the figure should be read.", "claims": [
        {"id": "c1", "claim": "The lab tested 40 nodes in 2025", "status": "supported", "supported_wording": "The lab ran the test on 40 nodes in 2025.",
         "evidence": [{"url": URL, "passage": "ran the test on 40 nodes", "date": "2025"}]},
        {"id": "c2", "claim": "Median latency fell from 120 ms to 85 ms", "status": "supported", "supported_wording": "Median latency fell from 120 ms to 85 ms.",
         "evidence": [{"url": URL, "passage": "Median latency fell from 120 ms to 85 ms"}]},
        {"id": "c3", "claim": "The team attributes the drop to the cache", "status": "attributed", "supported_wording": "The authors attribute the drop to the cache.",
         "evidence": [{"url": URL, "passage": "the cache was the cause"}]},
        {"id": "c4", "claim": "The change will cut hosting costs by 30 percent worldwide", "status": "unresolved", "supported_wording": "", "evidence": []}]}
    ANGLE = {"question": "Does the cache change explain the latency drop?", "reader": "an engineer deciding whether to copy the change", "angle": "what the report supports and where it stops",
             "verdict": "adds", "contributions": [{"id": "k1", "text": "States the scope limit the report leaves implicit", "kind": "analysis", "evidence_ids": ["c1", "c3"]}],
             "author_opportunities": [{"id": "a1", "prompt": "Add your own measurements if you ran this change", "why": "no first-hand data was supplied"}]}
    OUTLINE = {"sections": [{"heading": "What the test measured", "purpose": "setup", "evidence_ids": ["c1", "c2"]}, {"heading": "What the numbers leave open", "purpose": "limits", "evidence_ids": ["c3"]}]}
    FACTUAL = {"checked": [{"claim_id": "c1", "verdict": "supported"}, {"claim_id": "c2", "verdict": "supported"}, {"claim_id": "c3", "verdict": "supported"}, {"claim_id": "c4", "verdict": "omitted"}]}
    TITLES = {"candidates": [f"How a cache change moved median latency on 40 nodes, variant {i}" for i in range(1, 10)] + ["What a lab's cache test says about latency and what it leaves open"],
              "pick": "What a lab's cache test says about latency and what it leaves open", "rationale": "Names the subject and the scope limit the body proves.",
              "subtitle": "A 2025 report shows median latency falling from 120 ms to 85 ms on 40 nodes, for one workload."}

    def images(self, **over):
        png(self.pkg / "assets" / "hero.png")
        im = {"id": "hero", "path": "assets/hero.png", "purpose": "Shows the before and after medians as a simple bar diagram", "placement": "hero", "method": "diagram",
              "provenance": "Drawn by the pipeline operator from the two published medians; no photo or video source", "license": "CC0 1.0 (own work)",
              "caption": "Median latency before and after the change. Source: the lab report.", "alt": "Two bars comparing median latency of 120 ms and 85 ms"}
        im.update(over)
        return {"images": [im]}

    def to_stage(self, stage: str):
        """Drive every earlier stage to DONE with good artifacts. Returns self."""
        from scripts.write_pipeline.core import NAMES
        steps = {
            "source": lambda: self.submit("source", self.sources()),
            "research": lambda: self.submit("research", self.EVIDENCE),
            "angle": lambda: self.submit("angle", self.ANGLE),
            "outline": lambda: self.submit("outline", self.OUTLINE),
            "draft": lambda: self.submit("draft", self.texts["draft"]),
            "validate": lambda: self.submit("validate", self.texts["validate"], report=self.FACTUAL),
            "editorial": lambda: self.submit("editorial", self.texts["editorial"], report=UNSLOP),
            "voice": lambda: self.submit("voice", self.texts["voice"], report=UNSLOP),
            "antifp": lambda: (self.cli("antifp", "baseline"), self.cli("antifp", "finish"))[-1],
            "review": lambda: self.cli("run", "review"),
            "title": lambda: self.submit("title", self.TITLES),
            "images": lambda: self.submit("images", self.images()),
            "critic": lambda: self.cli("run", "critic"),
            "repair": lambda: self.cli("repair", "done"),
        }
        if not (self.pkg / "write-pipeline" / "state.json").exists():
            rc, _ = self.cli("init")
            assert rc == 0
        for n in NAMES:
            if n == stage:
                break
            rc, out = steps[n]()
            assert rc == 0, (n, rc, out)
        return self
