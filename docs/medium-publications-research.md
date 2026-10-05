# Filling data/medium-policy/publications.json

read_when: the router returns `B_NEEDS_PUBLICATION_RESEARCH`, or you are adding or re-verifying a Medium publication.

The router (`scripts/publish_route`) never invents publications. The list starts empty; an entry exists only because a human checked the publication's own submission guidelines. When no entry matches an article's topic tags the route is `B_NEEDS_PUBLICATION_RESEARCH` and `route.json` carries the topic tags to research.

## Schema (one object per publication)

| Field | Rule |
|---|---|
| `name`, `url` | the publication and its Medium URL |
| `topics` | non-empty list of lowercase tags; matched case-insensitively against the article's tags |
| `submission_url` | where writers submit, copied from the guidelines |
| `editorial_review` | must be `true`; entries without human editors are rejected |
| `accepts_ai_assisted_with_disclosure` | `true`, `false` or `"unknown"`. `false` is never offered; `"unknown"` is offered with a verify-first note |
| `source_url` | the official guidelines page you read |
| `verified_at` | ISO date of your check |

Bump the top-level `version` on every edit. Invalid entries are listed under `publications_rejected` in `route.json` and never matched.

## How to research one

1. Take the topic tags from `route.json` (`topics`).
2. On Medium, open candidate publications in those topics. Read each one's own "Submit" or "Write for us" page, not a third-party roundup.
3. Record only what that page states: that editors review submissions, the submission URL, and what it says about AI-assisted writing and disclosure. If it says nothing, use `"unknown"`; do not guess.
4. Check that Medium's own rules still apply: the AI disclosure stays on the story, and nothing here is meant to evade detection or moderation.
5. Add the entry, set `verified_at`, bump `version`, and commit.

Re-verify entries when a publication changes its guidelines; a stale `verified_at` is a reason to re-read the page.
