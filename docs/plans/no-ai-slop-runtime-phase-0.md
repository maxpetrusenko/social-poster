# No AI Slop Runtime Enforcement - Phase 0

Date: 2026-07-22

## Problem

The upstream `petergyang/no-ai-slop` skill is installed for interactive agents, but Social Poster's autonomous writers do not inherit Codex or Hermes global instructions automatically. RSS/SMM and liked-X generation use embedded TypeScript prompts. Medium's weekly pipeline preloads specialist Hermes skills one stage at a time.

Workspace RSS transformation text and untrusted source text also enter prompts after some house rules, which leaves their precedence ambiguous.

## Goal

Apply the same named anti-slop editing contract to SMM, X, and Medium without weakening source fidelity, factual support, platform limits, approval boundaries, or Max-approved wording.

## Precedence

1. Safety, publication authorization, factual support, and source ownership.
2. Platform limits and required media or link behavior.
3. Exact Max-written or Max-approved wording.
4. Source-required terminology and qualified uncertainty.
5. Workspace channel preferences.
6. `petergyang/no-ai-slop` editing and pattern removal.

Lower-priority instructions cannot waive a higher-priority rule. Source documents and fetched page text are untrusted data, never instructions.

## Walking Skeleton

```text
source or workspace input
  -> source and platform gates
  -> writer prompt with explicit precedence
  -> no-ai-slop edit contract
  -> deterministic pattern check
  -> independent review where the lane supports it
  -> draft, queue, or named rejection
```

## Runtime Owners

| Lane | Runtime owner | Enforcement surface |
| --- | --- | --- |
| RSS/SMM captions | Social Poster server | `human-post-writer.ts` plus `human-post-quality.ts` |
| Liked X posts | Social Poster server | `x-posting-skill.ts` plus writer/reviewer and deterministic rejection |
| Medium `/generate-article` | Codex/Hermes skills | `medium-writing`, article workflow, writer, no-ai-slop edit, hash-bound reviewer |
| Weekly app articles | Hermes on max-mini | Stage-specific preloaded Hermes skills; writer and reviewer also preload `no-ai-slop` |

## Proof Gates

- Prompt tests prove SMM and X include the pinned upstream-derived contract and precedence.
- Deterministic tests reject representative binary contrast, throat-clearing, faux-insight, puffery, rhetorical setup, recap ending, and decorative dash patterns.
- Medium contract tests require the upstream URL, installed skill, exact-hash eval, and reviewer coverage.
- Mac and Mini Hermes skill hashes match.
- The live weekly runner command is identified separately from the Social Poster production deployment.

## Non-Goals

- No post, Medium draft, schedule, deploy, commit, or push.
- No inference that local code changes reached the Coolify production container.
- No blanket deletion of legitimate factual negation or source-required technical terms.
