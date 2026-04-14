# Open Decisions

Last updated: 2026-04-13

## Purpose

Capture the remaining architecture calls that still block a straight-through build.

Treat the provisional default as the working assumption until a decision is made.

### SQLite vs Postgres Timing

Decision needed: when to cut over from SQLite to Postgres.

Recommendation: move before Milestone 3, after tenancy and account model are stable.

Tradeoff: earlier cutover adds migration work now, but avoids schema drift, concurrency traps, and a second rewrite later.

Provisional default: keep SQLite through Phase 0 to 2; cut over before composer, media, and calendar work.

### Media Before Calendar

Decision needed: whether media library work lands before calendar and queue planning.

Recommendation: build media first, then calendar.

Tradeoff: calendar slips slightly, but it can target stable assets, variants, and publish entities instead of raw `mediaUrl` fields.

Provisional default: keep Milestone 4 before Milestone 5.

### Credential Storage And Encryption

Decision needed: where provider secrets live and how they are encrypted.

Recommendation: store only encrypted credential references in the app DB and keep raw secrets in a dedicated secret layer.

Tradeoff: more plumbing up front, but rotation, revocation, and audit become explicit instead of ad hoc.

Provisional default: never store plaintext tokens in SQLite or Postgres; use envelope encryption or a managed secret store behind one credential service.

### Canonical Partial Failure Rule

Decision needed: what the post-level status is when some targets succeed and others fail.

Recommendation: mixed outcomes should resolve to `partial_failure`, not `failed`.

Tradeoff: the summary state is less coarse, but operators get truthful status without losing per-target detail.

Provisional default: `published` only when all targeted accounts succeed, `failed` only when all fail, `partial_failure` when outcomes are mixed.

### Bird/X And Inbox Transport

Decision needed: whether Bird stays the long-term X transport and what owns inbox delivery.

Recommendation: keep Bird as the short-term X sidecar, but move the product contract to a provider-agnostic transport layer.

Tradeoff: this preserves the current working path while avoiding a Bird-shaped product model that blocks inbox portability later.

Provisional default: X publishing and reply transport may use Bird where needed; inbox should be modeled as an abstract transport surface, not a Bird-specific feature.
