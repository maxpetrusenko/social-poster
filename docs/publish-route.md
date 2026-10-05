# Publish route

read_when: deciding how an article leaves the pipeline, or changing `scripts/publish_route`.

Every article passes two different checks, then gets exactly one route. Check 1 is the integrity release gate (`release authorize` / `verify`), never weakened. Check 2 is the advisory Medium review (`MEDIUM_REVIEW.json`). The AI disclosure stays on every story; nothing here tries to evade Medium's detection, moderation or disclosure rules.

| Route | When |
|---|---|
| A `DIRECT_PUBLISH` | Check 1 PASS, Check 2 finds author contribution integral and no distribution blockers |
| B `PUBLICATION_ROUTE` | Check 1 PASS, a human-edited publication is the better route (derivative, weak experience or originality, HIGH risk, author input needed). Candidates come only from `data/medium-policy/publications.json`; no match gives `B_NEEDS_PUBLICATION_RESEARCH` plus the topic tags |
| C `AUTO_REPAIR` | safe deterministic problems: Check 1 not yet PASS for these bytes, review safe fixes (ALT text, image credit from recorded provenance, formatting, source links, dedupe), a subtitle over 140 chars replaced by an approved shorter variant already in the package's title candidates, a title ` \| <suffix>` removed only when the suffix equals the queue item's channel or source name exactly |
| D `QUARANTINE` | Check 1 quarantine; Check 2 hard policy risk (image rights without recorded provenance and credit); author input required with no author material and no listed publication to route to; repair not finished after 2 cycles |

Boost likelihood is a recommendation. It is never an input: `boost_candidate: NO` alone still routes A.

## Code

- `decide.py`: pure function `decide(check1, review, meta, publications)`.
- `orchestrate.py`: gathers both checks by calling the existing CLIs as subprocesses with an allowlisted env (`gateway.child_env`), runs the bounded repair loop, writes and verifies `route.json`.
- `repair.py`: router-owned title/subtitle repairs; each writes a new `article-route-fix-<n>.md` and rebinds `version.json.finalFile`.
- `publications.py`: loads and validates the curated list. Research steps: `docs/medium-publications-research.md`.

```
python -m scripts.publish_route decide --package P [--article F] [--queue-item Q.json]   # never edits the article
python -m scripts.publish_route repair --package P [--max-cycles 2]                       # bounded AUTO_REPAIR loop
python -m scripts.publish_route verify --package P
```

Exit: 0 A, 10 B, 20 C pending, 3 D, 2 error (`verify`: 0 valid, 1 invalid).

## Repair loop

At most 2 cycles. Each cycle applies every safe fix, then reruns `release authorize` on the new bytes, then reruns the review (the review is cached by content hash). Then the router decides again. Still C after 2 cycles gives D (`D_REPAIR_EXHAUSTED`); `authorize` exit 2 (unresolvable package) gives D at once.

## route.json

`<package>/evals/publish-route/route.json`, binding `content_sha256`, `integrity_record_id` (from `release/authorization.json`), and the MEDIUM_REVIEW `policy_version`, plus a self hash. `verify` is invalid after any article byte change, a changed integrity record, a changed policy version, or any edit to the file itself. The self hash catches accidental edits, not a same-user forger (unlike the HMAC-signed gate records); route.json never authorizes a publish, only the release gate does.
