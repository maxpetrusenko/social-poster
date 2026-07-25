#!/usr/bin/env node
import crypto from "node:crypto";
import Database from "better-sqlite3";

const workspaceId = process.env.WORK_TO_POST_SEED_WORKSPACE_ID ?? "93a69b80-9641-47ee-afc1-fb77b24921fc";
const dbPath = process.env.DATABASE_URL ?? "./data/social-poster.db";
const db = new Database(dbPath);

const now = Date.now();
const account = process.env.WORK_TO_POST_SEED_ACCOUNT ?? "max-x";
const policy = "work-review-kanban-v1";
const approvalExpiresAt = now + 7 * 24 * 60 * 60 * 1000;

const events = [
  {
    slug: "codex-2026-07-24-work-review-loop",
    summary: "Built the proof-gated work-to-post review loop so completed Codex work becomes a reviewable content candidate instead of an automatic post.",
    occurredAt: "2026-07-24T22:00:00.000Z",
    proof: [
      ["commit", "https://github.com/maxpetrusenko/social-poster/commit/72f44cebb69d6be7e367703730dd709e837e3a6c"],
    ],
  },
  {
    slug: "codex-2026-07-24-calendar-db-first-render",
    summary: "Fixed calendar render by moving the route to a database-first path and bounding empty-state behavior for the dashboard.",
    occurredAt: "2026-07-24T21:00:00.000Z",
    proof: [
      ["commit", "https://github.com/maxpetrusenko/social-poster/commit/20ae87d6d0fea36d01a69deb9e596e37b6dce907"],
    ],
  },
  {
    slug: "codex-2026-07-24-browser-smoke-clean-exit",
    summary: "Resolved the browser smoke hang by keeping the work review route out of the default navigation smoke path.",
    occurredAt: "2026-07-24T20:00:00.000Z",
    proof: [
      ["commit", "https://github.com/maxpetrusenko/social-poster/commit/195e68b98dea83ac9c7760c6d1322f161636d179"],
      ["deploy_run", "https://github.com/maxpetrusenko/social-poster/actions/runs/30124355886"],
    ],
  },
  {
    slug: "codex-2026-07-24-node22-sqlite-hang-fix",
    summary: "Retired the legacy host path and aligned production on the Node 22 SQLite-backed app container.",
    occurredAt: "2026-07-24T19:00:00.000Z",
    proof: [
      ["commit", "https://github.com/maxpetrusenko/social-poster/commit/05d61fc63441c9e47ea98ea0e2db4953f2bca379"],
    ],
  },
];

const safeUri = (uri) => {
  const parsed = new URL(uri);
  if (parsed.protocol !== "https:" || parsed.search || parsed.hash) throw new Error(`Unsafe proof URI: ${uri}`);
  return uri;
};
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const idFor = (...parts) => `seed:${digest(parts.join(":")).slice(0, 32)}`;

const insertCompletion = db.prepare(`
  INSERT OR IGNORE INTO work_completion_events
    (id, workspace_id, source_agent, external_event_id, session_ref, project_ref, summary, privacy, status, occurred_at, created_at)
  VALUES
    (@id, @workspaceId, 'codex', @externalEventId, @sessionRef, 'social-poster', @summary, 'public_safe', 'eligible', @occurredAt, @createdAt)
`);
const insertProof = db.prepare(`
  INSERT OR IGNORE INTO work_completion_proofs
    (id, completion_event_id, type, uri, hash, verified_at, created_at)
  VALUES
    (@id, @completionEventId, @type, @uri, NULL, @verifiedAt, @createdAt)
`);
const insertCandidate = db.prepare(`
  INSERT OR IGNORE INTO content_candidates
    (id, workspace_id, completion_event_id, status, current_revision, created_at, updated_at)
  VALUES
    (@id, @workspaceId, @completionEventId, 'eligible', 1, @createdAt, @createdAt)
`);
const insertRevision = db.prepare(`
  INSERT OR IGNORE INTO content_revisions
    (id, candidate_id, revision_number, content_digest, media_digest, account_digest, policy_digest, assigned_account, policy_version, approval_expires_at, created_at)
  VALUES
    (@id, @candidateId, 1, @contentDigest, @mediaDigest, @accountDigest, @policyDigest, @assignedAccount, @policyVersion, @approvalExpiresAt, @createdAt)
`);
const insertAngle = db.prepare(`
  INSERT OR IGNORE INTO content_angles
    (id, candidate_id, revision_number, title, provenance, created_at)
  VALUES
    (@id, @candidateId, 1, @title, @provenance, @createdAt)
`);
const insertLifecycle = db.prepare(`
  INSERT OR IGNORE INTO content_lifecycle_events
    (id, workspace_id, candidate_id, event_type, revision_number, trace_ref, created_at)
  VALUES
    (@id, @workspaceId, @candidateId, @eventType, @revisionNumber, @traceRef, @createdAt)
`);

const write = db.transaction(() => {
  for (const event of events) {
    const completionEventId = idFor(workspaceId, event.slug, "completion");
    const candidateId = idFor(workspaceId, event.slug, "candidate");
    const createdAt = Date.parse(event.occurredAt) || now;
    insertCompletion.run({
      id: completionEventId,
      workspaceId,
      externalEventId: digest(event.slug),
      sessionRef: digest(`seed:${event.slug}`),
      summary: event.summary,
      occurredAt: Date.parse(event.occurredAt),
      createdAt,
    });
    for (const [type, uri] of event.proof) {
      insertProof.run({
        id: idFor(completionEventId, type, uri),
        completionEventId,
        type,
        uri: safeUri(uri),
        verifiedAt: createdAt,
        createdAt,
      });
    }
    insertCandidate.run({ id: candidateId, workspaceId, completionEventId, createdAt });
    insertRevision.run({
      id: idFor(candidateId, "revision", "1"),
      candidateId,
      contentDigest: digest(event.summary),
      mediaDigest: digest("media:none"),
      accountDigest: digest(account),
      policyDigest: digest(policy),
      assignedAccount: account,
      policyVersion: policy,
      approvalExpiresAt,
      createdAt,
    });
    insertAngle.run({
      id: idFor(candidateId, "angle", "proof-first"),
      candidateId,
      title: "Proof-first operator update",
      provenance: `seeded from ${event.proof[0][1]}`,
      createdAt,
    });
    insertLifecycle.run({ id: idFor(candidateId, "completion", "eligible"), workspaceId, candidateId, eventType: "completion.eligible", revisionNumber: 0, traceRef: `seed:${event.slug}`, createdAt });
    insertLifecycle.run({ id: idFor(candidateId, "candidate", "created"), workspaceId, candidateId, eventType: "candidate.created", revisionNumber: 1, traceRef: `completion:${completionEventId}`, createdAt });
  }
});

write();
const counts = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM work_completion_events WHERE workspace_id = ?) AS completions,
    (SELECT COUNT(*) FROM content_candidates WHERE workspace_id = ?) AS candidates
`).get(workspaceId, workspaceId);
console.log(JSON.stringify({ dbPath, workspaceId, completions: counts.completions, candidates: counts.candidates }, null, 2));
