"""Shared contracts for the release gate, self-healing loop, Hermes guard and nightly watchdog.

This module is the interface every workstream builds against. It holds types, constants and
function signatures only; implementations live in the modules named in each docstring. Change
it only through the lead. See docs/fingerprint-gate-integration.md for the full spec.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Callable, Protocol

CONTRACT_VERSION = 1

# ---- gate results ---------------------------------------------------------------------------------
EXIT_PASS, EXIT_FAIL, EXIT_ERROR = 0, 1, 2          # run_gate (existing)
EXIT_QUARANTINED, EXIT_INFRA_QUARANTINED = 3, 4     # release authorize


class Result(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    ERROR = "ERROR"


class Category(str, Enum):
    PASS = "PASS"
    # content (repair changes bytes -> new hash -> full new gate run)
    CONTENT_CLAIM_FAILURE = "CONTENT_CLAIM_FAILURE"
    ADDED_UNSUPPORTED_CLAIM = "ADDED_UNSUPPORTED_CLAIM"
    MISSING_LINK = "MISSING_LINK"
    STRUCTURAL_DAMAGE = "STRUCTURAL_DAMAGE"
    MISSING_SOURCE = "MISSING_SOURCE"
    # infrastructure (never modifies bytes -> rerun same hash)
    STALE_EVALUATION = "STALE_EVALUATION"
    MODEL_TIMEOUT = "MODEL_TIMEOUT"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    GATEWAY_FAILURE = "GATEWAY_FAILURE"
    MALFORMED_MODEL_OUTPUT = "MALFORMED_MODEL_OUTPUT"
    DEPENDENCY_FAILURE = "DEPENDENCY_FAILURE"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
    # terminal
    NEEDS_REVIEW = "NEEDS_REVIEW"


CONTENT_CATEGORIES = frozenset({Category.CONTENT_CLAIM_FAILURE, Category.ADDED_UNSUPPORTED_CLAIM, Category.MISSING_LINK,
                                Category.STRUCTURAL_DAMAGE, Category.MISSING_SOURCE})
INFRA_CATEGORIES = frozenset({Category.STALE_EVALUATION, Category.MODEL_TIMEOUT, Category.MODEL_UNAVAILABLE, Category.GATEWAY_FAILURE,
                              Category.MALFORMED_MODEL_OUTPUT, Category.DEPENDENCY_FAILURE, Category.UNKNOWN_ERROR})

# Errors carry a category so the classifier never parses free text.
# errors.EvaluationError gains `category: Category = Category.UNKNOWN_ERROR` and `dependency: str | None`.
# gate.json gains: "result": Result, "error_category": Category | None, "failure_categories": [Category, ...]
# (all content categories found, cheapest-first), plus everything in EvalRecord below.

# ---- approved fallbacks and dependencies (no LLM chooses these) -------------------------------------
APPROVED_FALLBACKS: dict[str, tuple[str, ...]] = {
    "claude:sonnet": ("qwen3:8b",),          # extractor / judge
    "nomic-embed-text:latest": (),            # embeddings: no fallback
}
DEPENDENCIES = ("gateway-chat", "gateway-embed", "claude-cli", "codex-cli", "doppler")
MAX_REPAIR_CYCLES = 3
CIRCUIT_FAILURE_THRESHOLD = 3
CIRCUIT_COOLDOWN_SECONDS = 1800
INFRA_BACKOFF_SECONDS = (10, 30, 90)
FG_ENV_KEYS = ("FINGERPRINT_EVAL_KEY_FILE", "FINGERPRINT_EVAL_WORKSPACE", "FINGERPRINT_EVAL_TEST_MODE", "FINGERPRINT_EVAL_REPAIRER")


def clamp_cycles(value) -> int:
    """max_cycles at an API boundary: a finite int (bool/NaN/inf/str rejected with ValueError) clamped to [0, MAX_REPAIR_CYCLES]."""
    import math
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"max_cycles must be a finite int, got {value!r}")
    if isinstance(value, float):
        if not math.isfinite(value) or value != int(value):
            raise ValueError(f"max_cycles must be a finite int, got {value!r}")
        value = int(value)
    return max(0, min(MAX_REPAIR_CYCLES, value))

# ---- paths inside an article package --------------------------------------------------------------
GATE_DIR = Path("evals/fingerprint-gate")
RUNS_DIR = GATE_DIR / "runs"                  # immutable <UTC-ts>-<content12>.json records
LEDGER = GATE_DIR / "ledger.jsonl"            # append-only LedgerEvent lines
SUMMARY = GATE_DIR / "SUMMARY.md"             # human-visible block
RELEASE_DIR = Path("release")
RELEASE_ARTICLE = RELEASE_DIR / "medium-final.md"
RELEASE_AUTH = RELEASE_DIR / "authorization.json"
QUARANTINE = Path("QUARANTINE.json")
HEALED_PATTERN = "article-healed-{n}.md"      # never overwrite earlier versions

# workspace-level (relative to data/article-workspace/)
CIRCUITS_FILE = Path("fingerprint-eval/circuits.json")
NIGHTLY_DIR = Path("reports/fingerprint-nightly")
RELEASE_ACTIVE = Path("release/ACTIVE.json")  # the one package currently allowed to touch Medium

# repo-level frozen author corpus
AUTHOR_CORPUS_DIR = Path("data/fingerprint-eval/author-corpus")
AUTHOR_CORPUS_MANIFEST = AUTHOR_CORPUS_DIR / "MANIFEST.json"


# ---- versions ---------------------------------------------------------------------------------------
@dataclass(frozen=True)
class EvaluatorVersion:
    git_sha: str                  # social-poster HEAD
    tree_sha256: str              # sha256 over sorted scripts/fingerprint_eval/**/*.py (path + bytes)
    dirty: bool                   # uncommitted changes under scripts/fingerprint_eval -> release refuses

    @property
    def id(self) -> str:
        return f"{self.git_sha}-dirty-{self.tree_sha256[:12]}" if self.dirty else self.git_sha


@dataclass(frozen=True)
class Binding:
    """What a PASS is bound to. Authorization is valid only if all three equal the current values."""
    content_sha256: str
    evaluator_id: str
    author_corpus_sha256: str
    # round-3 additions (backward compatible: "" = not bound, never equal to a real current value)
    evaluator_tree_sha256: str = ""
    reference_sha256: str = ""
    reference_record_sha256: str = ""   # sha256 of the prepublish/rating record that bound the reference; "" if none


# ---- package resolution ------------------------------------------------------------------------------
@dataclass(frozen=True)
class PackageCtx:
    package: Path                 # article package dir
    slug: str
    final_path: Path              # resolver: version.json.finalFile > article-medium.md > version.json.articleFile
    final_rule: str               # which rule chose it
    reference_path: Path | None   # rated/last-known-good version; None -> MISSING_SOURCE
    source_notes: Path | None     # sources/source-notes.md if present


# ---- records -----------------------------------------------------------------------------------------
@dataclass
class HealCycle:
    index: int
    input_sha256: str
    category: Category
    kind: str                     # "content" | "infra"
    reasons: list[str]
    repair: str                   # function name + what was restored from which file/hash, or "retry"/"fallback:<model>"
    model: str | None
    output_sha256: str            # == input_sha256 for infra
    result: Result
    elapsed_s: float


@dataclass
class EvalRecord:
    """Immutable, one per gate execution, written to RUNS_DIR. Schema-validated before use."""
    schema_version: int
    slug: str
    binding: Binding
    final_path: str
    final_rule: str
    reference_path: str | None
    reference_sha256: str | None
    reference_identical: bool
    timestamp_utc: str
    evaluator_tree_sha256: str
    pipeline_corpus_sha256: str
    models: dict                  # {"extractor": {...}, "judge": {...}, "embedding": {...}} name/family/backend/version
    claims: dict                  # total, preserved, changed, missing, added_unsupported, judged_by ("identity" when reference_identical)
    links: dict                   # expected, preserved, missing[]
    structure: dict               # images/headings/code/frozen: expected, preserved, diffs
    semantic: dict                # whole, section_min, threshold
    advisory: dict                # author_distance, jsd, repeated_ngram_rate, rule_of_three, templates, pipeline_outlier_z, advisory_errors[]
    result: Result
    category: Category
    reasons: list[str]
    runtime_s: float
    raw_report_path: str
    heal_cycle: int = 0
    parent_content_sha256: str | None = None
    cache_hit: bool = False       # served from cache keyed by Binding (no model calls)
    raw_report_sha256: str | None = None   # sha256 of the raw gate report at raw_report_path (covered by the record HMAC)


class LedgerState(str, Enum):
    GATE_REQUESTED = "GATE_REQUESTED"
    GATE_EXECUTED = "GATE_EXECUTED"
    RESULT_VALID = "RESULT_VALID"
    RESULT_MATCHES_CONTENT = "RESULT_MATCHES_CONTENT"
    PUBLISH_AUTHORIZED = "PUBLISH_AUTHORIZED"
    PUBLISH_BLOCKED = "PUBLISH_BLOCKED"
    HEAL_CYCLE = "HEAL_CYCLE"
    QUARANTINED = "QUARANTINED"


@dataclass
class LedgerEvent:
    ts_utc: str
    state: LedgerState
    content_sha256: str
    evaluator_id: str
    detail: dict = field(default_factory=dict)


@dataclass
class Authorization:
    """release/authorization.json. Valid iff binding == current Binding and record says PASS."""
    binding: Binding
    record_path: str
    authorized_at_utc: str
    release_article_sha256: str   # sha256(release/medium-final.md) == binding.content_sha256


@dataclass
class HealOutcome:
    final_result: Result
    category: Category            # PASS or the terminal category
    record: EvalRecord | None     # the last canonical gate record
    cycles: list[HealCycle]
    final_path: Path              # path whose bytes the last record evaluated
    quarantined: bool


# ---- function signatures (implementations in the named modules) ---------------------------------------
GateFn = Callable[[PackageCtx, Path], EvalRecord]
"""authz.evaluate_package(ctx, candidate_path) -> EvalRecord. The ONLY producer of PASS. Uses the cache keyed
by Binding; never raises (ERROR records carry a Category)."""


class Repairer(Protocol):
    """repair.py. Deterministic; grounded only in ctx.reference_path / ctx.source_notes. Returns the new
    candidate path (written as HEALED_PATTERN) or None when support cannot be established."""
    def __call__(self, ctx: PackageCtx, candidate: Path, record: EvalRecord, cycle: int) -> Path | None: ...

# heal.run_heal_loop(ctx, gate_fn: GateFn, repairer: Repairer, max_cycles=MAX_REPAIR_CYCLES) -> HealOutcome
# circuit.Circuit(dep).allow() -> bool ; .record_success() ; .record_failure(category) ; state persisted in CIRCUITS_FILE
# authz.current_binding(ctx, candidate) -> Binding ; authz.evaluator_version() -> EvaluatorVersion
# authz.corpus_sha256() -> str ; authz.resolve_package(package) -> PackageCtx
# release CLI: authorize --package P [--max-repairs N] [--dry-run] ; verify --package P ; status --package P [--json]
#   verify exit 0 only if RELEASE_ARTICLE bytes == current final bytes and Authorization.binding == current Binding
# hermes guard: scripts/hermes/medium_publish_guard.py reads tool-call JSON on stdin; blocks Medium mutations
#   unless RELEASE_ACTIVE names a package whose `release verify` exits 0.
# nightly: python -m scripts.fingerprint_eval.nightly [--workspace W] [--retry-infra-quarantine] ; read-only over
#   article prose; CRITICAL if any scheduled/published package lacks a matching Authorization.
