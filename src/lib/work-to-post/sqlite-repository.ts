import "server-only";

import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  contentCandidates,
  contentAngles,
  contentComments,
  contentDecisions,
  contentLifecycleEvents,
  contentRevisions,
  contentReviews,
  commandReceipts,
  dispatchIntents,
  personDossierClaims,
  personDossierSources,
  personDossierVersions,
  personDossiers,
  referenceExamples,
  workCompletionEvents,
  workCompletionProofs,
} from "@/db/schema";
import type {
  CompletedWorkEventInput,
  CompletionStatus,
  DossierStatus,
  PersonDossierResult,
} from "./contracts";
import type { CompletionRecord, DecisionRecord, DecisionClaim, DispatchScope, WorkToPostRepository } from "./repository";

function date(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid ISO timestamp.");
  return parsed;
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Error && "code" in error &&
    (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.code === "SQLITE_CONSTRAINT_PRIMARYKEY");
}

export function createSqliteWorkToPostRepository(): WorkToPostRepository {
  return {
    async findCompletion(workspaceId, sourceAgent, externalEventId) {
      const row = await db.select().from(workCompletionEvents).where(and(eq(workCompletionEvents.workspaceId, workspaceId), eq(workCompletionEvents.sourceAgent, sourceAgent), eq(workCompletionEvents.externalEventId, externalEventId))).get();
      if (!row) return null;
      const proof = await db.select().from(workCompletionProofs).where(eq(workCompletionProofs.completionEventId, row.id));
      return { id: row.id, workspaceId, status: row.status as CompletionStatus, input: { sourceAgent: row.sourceAgent as CompletedWorkEventInput["sourceAgent"], externalEventId: row.externalEventId, sessionRef: row.sessionRef, projectRef: row.projectRef, summary: row.summary, occurredAt: row.occurredAt.toISOString(), privacy: row.privacy as CompletedWorkEventInput["privacy"], proof: proof.map((item) => ({ type: item.type as CompletedWorkEventInput["proof"][number]["type"], uri: item.uri, ...(item.hash ? { hash: item.hash } : {}), ...(item.verifiedAt ? { verifiedAt: item.verifiedAt.toISOString() } : {}) })) } } satisfies CompletionRecord;
    },
    async createCompletion(workspaceId, input, status) {
      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(workCompletionEvents).values({ id, workspaceId, sourceAgent: input.sourceAgent, externalEventId: input.externalEventId, sessionRef: input.sessionRef, projectRef: input.projectRef, summary: input.summary, privacy: input.privacy, status, occurredAt: date(input.occurredAt), createdAt: now });
      if (input.proof.length) await db.insert(workCompletionProofs).values(input.proof.map((proof) => ({ id: crypto.randomUUID(), completionEventId: id, type: proof.type, uri: proof.uri, hash: proof.hash ?? null, verifiedAt: proof.verifiedAt ? date(proof.verifiedAt) : null, createdAt: now })));
      return { id, workspaceId, input, status };
    },
    async ingestCompletion(workspaceId, input, status) {
      const existing = await this.findCompletion(workspaceId, input.sourceAgent, input.externalEventId);
      if (existing) {
        const candidate = existing.status === "blocked_privacy" ? null : await this.findCandidateByCompletion(workspaceId, existing.id);
        return { status: existing.status, completionEventId: existing.id, candidateId: candidate?.id ?? null, replayed: true };
      }
      const completionId = crypto.randomUUID(); const candidateId = status === "blocked_privacy" ? null : crypto.randomUUID(); const now = new Date();
      try {
        await db.transaction((tx) => {
          tx.insert(workCompletionEvents).values({ id: completionId, workspaceId, sourceAgent: input.sourceAgent, externalEventId: input.externalEventId, sessionRef: input.sessionRef, projectRef: input.projectRef, summary: input.summary, privacy: input.privacy, status, occurredAt: date(input.occurredAt), createdAt: now }).run();
          if (input.proof.length) tx.insert(workCompletionProofs).values(input.proof.map((proof) => ({ id: crypto.randomUUID(), completionEventId: completionId, type: proof.type, uri: proof.uri, hash: proof.hash ?? null, verifiedAt: proof.verifiedAt ? date(proof.verifiedAt) : null, createdAt: now }))).run();
          tx.insert(contentLifecycleEvents).values({ id: crypto.randomUUID(), workspaceId, candidateId: completionId, eventType: `completion.${status}`, revisionNumber: 0, traceRef: null, createdAt: now }).run();
          if (!candidateId) return;
          const digestValue = digest(`candidate:${candidateId}:1`);
          tx.insert(contentCandidates).values({ id: candidateId, workspaceId, completionEventId: completionId, status: status === "eligible" ? "eligible" : "needs_proof", currentRevision: 1, createdAt: now, updatedAt: now }).run();
          tx.insert(contentRevisions).values({ id: crypto.randomUUID(), candidateId, revisionNumber: 1, contentDigest: digestValue, mediaDigest: digest("media:fixture"), accountDigest: digest("account:fixture-account"), policyDigest: digest("policy:v1"), assignedAccount: "fixture-account", policyVersion: "v1", approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1000), createdAt: now }).run();
          tx.insert(contentLifecycleEvents).values({ id: crypto.randomUUID(), workspaceId, candidateId, eventType: "candidate.created", revisionNumber: 1, traceRef: `completion:${completionId}`, createdAt: now }).run();
        });
      } catch (error) {
        const replay = await this.findCompletion(workspaceId, input.sourceAgent, input.externalEventId);
        if (!replay) throw error;
        const candidate = replay.status === "blocked_privacy" ? null : await this.findCandidateByCompletion(workspaceId, replay.id);
        return { status: replay.status, completionEventId: replay.id, candidateId: candidate?.id ?? null, replayed: true };
      }
      return { status, completionEventId: completionId, candidateId, replayed: false };
    },
    async createCandidate(workspaceId, completionEventId, status) {
      const id = crypto.randomUUID(); const now = new Date();
      await db.insert(contentCandidates).values({ id, workspaceId, completionEventId, status, currentRevision: 1, createdAt: now, updatedAt: now });
      await db.insert(contentRevisions).values({ id: crypto.randomUUID(), candidateId: id, revisionNumber: 1, contentDigest: digest(`candidate:${id}:1`), mediaDigest: digest("media:none"), accountDigest: digest("account:unassigned"), policyDigest: digest("policy:local-only"), createdAt: now });
      return { id, workspaceId, completionEventId, status, revision: 1 };
    },
    async findCandidateByCompletion(workspaceId, completionEventId) {
      const row = await db.select().from(contentCandidates).where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.completionEventId, completionEventId))).get();
      return row ? { id: row.id, workspaceId, completionEventId, status: row.status, revision: row.currentRevision } : null;
    },
    async getCandidate(workspaceId, candidateId) {
      const row = await db.select().from(contentCandidates).where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.id, candidateId))).get();
      return row ? { id: row.id, workspaceId, completionEventId: row.completionEventId, status: row.status, revision: row.currentRevision } : null;
    },
    async appendLifecycle(record) {
      const saved = { ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      await db.insert(contentLifecycleEvents).values({ id: saved.id, workspaceId: saved.workspaceId, candidateId: saved.candidateId, eventType: saved.eventType, revisionNumber: saved.revision, traceRef: saved.traceRef, createdAt: date(saved.createdAt) });
      return saved;
    },
    async claimDecision(input): Promise<DecisionClaim> {
      const receipt = await db.select().from(commandReceipts).where(and(eq(commandReceipts.workspaceId, input.workspaceId), eq(commandReceipts.operation, "decision"), eq(commandReceipts.idempotencyKey, input.idempotencyKey))).get();
      if (receipt) {
        if (receipt.requestHash !== input.requestHash || receipt.candidateId !== input.candidateId || receipt.commandType !== input.command.type) throw new Error("Idempotency key was already used for a different request.");
        if (receipt.state === "completed" && receipt.response) return { kind: "replay", decision: JSON.parse(receipt.response) as DecisionRecord };
        if (receipt.state === "processing" && receipt.leaseExpiresAt && receipt.leaseExpiresAt.getTime() > Date.now()) throw new Error("Idempotency request is in progress.");
        const reclaimed = await db.update(commandReceipts).set({
          state: "processing",
          leaseExpiresAt: new Date(Date.now() + 30_000),
          attempts: receipt.attempts + 1,
          updatedAt: new Date(),
        }).where(and(
          eq(commandReceipts.id, receipt.id),
          eq(commandReceipts.state, receipt.state),
          ...(receipt.leaseExpiresAt ? [eq(commandReceipts.leaseExpiresAt, receipt.leaseExpiresAt)] : []),
        ));
        if (reclaimed.changes === 0) return this.claimDecision(input);
        return { kind: "claimed" };
      }
      const candidate = await this.getCandidate(input.workspaceId, input.candidateId);
      if (!candidate) throw new Error("Candidate not found in this workspace.");
      const now = new Date();
      try {
        await db.insert(commandReceipts).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, operation: "decision", idempotencyKey: input.idempotencyKey, candidateId: input.candidateId, revisionNumber: candidate.revision, commandType: input.command.type, scopeDigest: input.requestHash, requestHash: input.requestHash, state: "processing", leaseExpiresAt: new Date(now.getTime() + 30_000), attempts: 1, response: null, createdAt: now, updatedAt: now });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        return this.claimDecision(input);
      }
      return { kind: "claimed" };
    },
    async completeDecision(record) {
      const approval = (record as typeof record & { approvalDigest?: string }).approvalDigest ?? null;
      const existing = approval
        ? await db.select().from(contentDecisions).where(and(eq(contentDecisions.workspaceId, record.workspaceId), eq(contentDecisions.approvalDigest, approval))).get()
        : null;
      const id = existing?.id ?? crypto.randomUUID();
      const dispatchId = existing?.dispatchId ?? record.dispatchId;
      const saved = { ...record, id, dispatchId };
      const finishReceipt = async () => {
        await db.update(commandReceipts).set({ state: "completed", leaseExpiresAt: null, response: JSON.stringify(saved), updatedAt: new Date() }).where(and(eq(commandReceipts.workspaceId, record.workspaceId), eq(commandReceipts.operation, "decision"), eq(commandReceipts.idempotencyKey, record.idempotencyKey), eq(commandReceipts.requestHash, record.requestHash)));
      };
      if (existing) {
        await finishReceipt();
        return saved;
      }
      try {
        await db.insert(contentDecisions).values({ id, workspaceId: record.workspaceId, candidateId: record.candidateId, commandType: record.command.type, requestHash: record.requestHash, approvalDigest: approval, dispatchId, createdAt: new Date() });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        const winner = approval
          ? await db.select().from(contentDecisions).where(and(eq(contentDecisions.workspaceId, record.workspaceId), eq(contentDecisions.approvalDigest, approval))).get()
          : await db.select().from(contentDecisions).where(and(eq(contentDecisions.workspaceId, record.workspaceId), eq(contentDecisions.requestHash, record.requestHash))).get();
        if (!winner?.dispatchId) throw error;
        saved.id = winner.id;
        saved.dispatchId = winner.dispatchId;
      }
      await finishReceipt();
      return saved;
    },
    async markDecisionCandidate(workspaceId, candidateId, revision, command) {
      if (command.type === "deny") return null;
      const status = command.type === "approve_schedule" ? "scheduled" : "published";
      const updated = await db.update(contentCandidates)
        .set({ status, updatedAt: new Date() })
        .where(and(
          eq(contentCandidates.workspaceId, workspaceId),
          eq(contentCandidates.id, candidateId),
          eq(contentCandidates.currentRevision, revision),
        ));
      if (updated.changes === 0) return null;
      return { id: candidateId, status, currentRevision: revision };
    },
    async abandonDecision(workspaceId: string, idempotencyKey: string, requestHash: string) {
      await db.update(commandReceipts).set({ state: "failed", leaseExpiresAt: null, updatedAt: new Date() }).where(and(eq(commandReceipts.workspaceId, workspaceId), eq(commandReceipts.operation, "decision"), eq(commandReceipts.idempotencyKey, idempotencyKey), eq(commandReceipts.requestHash, requestHash), eq(commandReceipts.state, "processing")));
    },
    async createDispatch(workspaceId, candidateId, action, approvalDigest) {
      const id = crypto.randomUUID(); const now = new Date();
      try { await db.insert(dispatchIntents).values({ id, workspaceId, candidateId, action, status: action, requestHash: digest(`${candidateId}:${action}`), approvalDigest, createdAt: now }); }
      catch (error) { if (!isUniqueConstraint(error)) throw error; const existing = await db.select().from(dispatchIntents).where(and(eq(dispatchIntents.workspaceId, workspaceId), eq(dispatchIntents.approvalDigest, approvalDigest))).get(); if (!existing) throw error; return existing.id; }
      return id;
    },
    async getDispatchScope(workspaceId, candidateId, revision) {
      const candidate = await db.select().from(contentCandidates).where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.id, candidateId), eq(contentCandidates.currentRevision, revision))).get();
      if (!candidate) return null;
      const contentRevision = await db.select().from(contentRevisions).where(and(eq(contentRevisions.candidateId, candidateId), eq(contentRevisions.revisionNumber, revision))).get();
      if (!contentRevision) return null;
      const review = await db.select().from(contentReviews).where(and(eq(contentReviews.candidateId, candidateId), eq(contentReviews.revisionNumber, revision), eq(contentReviews.revisionDigest, contentRevision.contentDigest))).get();
      return { revisionDigest: contentRevision.contentDigest, mediaDigest: contentRevision.mediaDigest ?? digest("media:none"), assignedAccount: contentRevision.assignedAccount, policyVersion: contentRevision.policyVersion, approvalExpiresAt: contentRevision.approvalExpiresAt?.toISOString() ?? null, reviewStatus: review?.status ?? null, reviewDigest: review?.revisionDigest ?? null, candidateStatus: candidate.status } satisfies DispatchScope;
    },
    async upsertDossier(workspaceId, input, status) {
      const now = new Date();
      const existing = await db.select().from(personDossiers).where(and(eq(personDossiers.workspaceId, workspaceId), eq(personDossiers.canonicalIdentityKey, input.canonicalIdentityKey))).get();
      const id = existing?.id ?? crypto.randomUUID(); const version = (existing?.currentVersion ?? 0) + 1;
      if (existing) await db.update(personDossiers).set({ displayName: input.displayName, status, currentVersion: version, updatedAt: now }).where(eq(personDossiers.id, id));
      else await db.insert(personDossiers).values({ id, workspaceId, canonicalIdentityKey: input.canonicalIdentityKey, displayName: input.displayName, status, currentVersion: version, createdAt: now, updatedAt: now });
      const versionId = crypto.randomUUID();
      await db.insert(personDossierVersions).values({ id: versionId, dossierId: id, versionNumber: version, status, createdAt: now });
      if (input.sources.length) await db.insert(personDossierSources).values(input.sources.map((source) => ({ id: crypto.randomUUID(), dossierVersionId: versionId, url: source.url, kind: source.kind, capturedAt: date(source.capturedAt), createdAt: now })));
      if (input.claims.length) await db.insert(personDossierClaims).values(input.claims.map((claim) => ({ id: crypto.randomUUID(), dossierVersionId: versionId, statement: claim.statement, sourceUrls: JSON.stringify(claim.sourceUrls), createdAt: now })));
      return { id, version, status, ...input };
    },
  };
}

function digest(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }

async function completionPayload(completionEventId: string) {
  const completion = await db.select().from(workCompletionEvents).where(eq(workCompletionEvents.id, completionEventId)).get();
  if (!completion) return null;
  const proof = await db.select().from(workCompletionProofs).where(eq(workCompletionProofs.completionEventId, completionEventId));
  return {
    sourceAgent: completion.sourceAgent,
    projectRef: completion.projectRef,
    summary: completion.summary,
    occurredAt: completion.occurredAt.toISOString(),
    privacy: completion.privacy,
    proof: proof.map((item) => ({
      type: item.type,
      uri: item.uri,
      hash: item.hash,
      verifiedAt: item.verifiedAt?.toISOString() ?? null,
    })),
  };
}

export async function listCandidates(workspaceId: string) {
  const rows = await db.select().from(contentCandidates).where(eq(contentCandidates.workspaceId, workspaceId)).orderBy(asc(contentCandidates.createdAt));
  return Promise.all(rows.map(async (candidate) => {
    const completion = await completionPayload(candidate.completionEventId);
    return {
      ...candidate,
      sourceAgent: completion?.sourceAgent ?? null,
      projectRef: completion?.projectRef ?? null,
      summary: completion?.summary ?? null,
      occurredAt: completion?.occurredAt ?? null,
      privacy: completion?.privacy ?? null,
      proof: completion?.proof ?? [],
    };
  }));
}

export async function getCandidateTimeline(workspaceId: string, candidateId: string) {
  const candidate = await db.select().from(contentCandidates).where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.id, candidateId))).get();
  if (!candidate) return null;
  const completion = await completionPayload(candidate.completionEventId);
  const timeline = await db.select().from(contentLifecycleEvents).where(and(eq(contentLifecycleEvents.workspaceId, workspaceId), eq(contentLifecycleEvents.candidateId, candidateId))).orderBy(asc(contentLifecycleEvents.createdAt));
  const [angles, comments, revisions, currentRevision] = await Promise.all([
    db.select().from(contentAngles).where(eq(contentAngles.candidateId, candidateId)),
    db.select().from(contentComments).where(eq(contentComments.candidateId, candidateId)),
    db.select().from(contentRevisions).where(eq(contentRevisions.candidateId, candidateId)),
    db.select().from(contentRevisions).where(and(
      eq(contentRevisions.candidateId, candidateId),
      eq(contentRevisions.revisionNumber, candidate.currentRevision),
    )).get(),
  ]);
  const review = currentRevision
    ? await db.select().from(contentReviews).where(and(
      eq(contentReviews.candidateId, candidateId),
      eq(contentReviews.revisionNumber, candidate.currentRevision),
      eq(contentReviews.revisionDigest, currentRevision.contentDigest),
    )).get()
    : null;
  const allowed = Boolean(
    candidate.status === "eligible" &&
    currentRevision?.assignedAccount &&
    currentRevision.policyVersion &&
    currentRevision.approvalExpiresAt &&
    currentRevision.approvalExpiresAt.getTime() > Date.now() &&
    review?.status === "pass",
  );
  const reason = allowed
    ? null
    : candidate.status !== "eligible"
      ? "Candidate proof is not eligible."
      : review?.status !== "pass"
        ? "An exact passing independent review is required."
        : !currentRevision?.assignedAccount
          ? "A concrete account assignment is required."
          : "The server approval scope is missing or expired.";
  return {
    candidate: {
      ...candidate,
      sourceAgent: completion?.sourceAgent ?? null,
      projectRef: completion?.projectRef ?? null,
      summary: completion?.summary ?? null,
      occurredAt: completion?.occurredAt ?? null,
      privacy: completion?.privacy ?? null,
      proof: completion?.proof ?? [],
    },
    completion,
    timeline,
    angles,
    comments,
    revisions,
    release: {
      allowed,
      reason,
      account: currentRevision?.assignedAccount ?? null,
      policyVersion: currentRevision?.policyVersion ?? null,
      approvalExpiresAt: currentRevision?.approvalExpiresAt?.toISOString() ?? null,
      reviewStatus: review?.status ?? null,
    },
  };
}

export async function recordContentReview(
  workspaceId: string,
  candidateId: string,
  revisionNumber: number,
  status: "pass" | "fail",
) {
  const candidate = await db.select().from(contentCandidates)
    .where(and(
      eq(contentCandidates.workspaceId, workspaceId),
      eq(contentCandidates.id, candidateId),
      eq(contentCandidates.currentRevision, revisionNumber),
    )).get();
  if (!candidate) throw new Error("Candidate revision is stale or outside this workspace.");
  const revision = await db.select().from(contentRevisions)
    .where(and(
      eq(contentRevisions.candidateId, candidateId),
      eq(contentRevisions.revisionNumber, revisionNumber),
    )).get();
  if (!revision) throw new Error("Candidate revision is unavailable.");
  const now = new Date();
  await db.transaction((tx) => {
    tx.insert(contentReviews).values({
      id: crypto.randomUUID(),
      candidateId,
      revisionNumber,
      revisionDigest: revision.contentDigest,
      status,
      createdAt: now,
    }).run();
    tx.insert(contentLifecycleEvents).values({
      id: crypto.randomUUID(),
      workspaceId,
      candidateId,
      eventType: `review.${status}`,
      revisionNumber,
      traceRef: null,
      createdAt: now,
    }).run();
  });
}

export async function persistReferenceExamples(workspaceId: string, examples: Array<{ sourceUrl: string; author: string; capturedAt: string; mechanism: string }>) {
  const now = new Date();
  if (!examples.length) return [];
  const rows = examples.map((example) => ({ id: crypto.randomUUID(), workspaceId, sourceUrl: example.sourceUrl, author: example.author, capturedAt: date(example.capturedAt), mechanism: example.mechanism, createdAt: now }));
  await db.insert(referenceExamples).values(rows);
  return rows;
}

export async function persistAngles(candidateId: string, revisionNumber: number, angles: Array<{ title: string; provenance: unknown }>) {
  const now = new Date();
  if (!angles.length) return [];
  const rows = angles.map((angle) => ({ id: crypto.randomUUID(), candidateId, revisionNumber, title: angle.title, provenance: JSON.stringify(angle.provenance), createdAt: now }));
  await db.insert(contentAngles).values(rows);
  return rows;
}

export async function appendCommentRevision(workspaceId: string, candidateId: string, expectedRevision: number, body: string) {
  const candidate = await db.select().from(contentCandidates).where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.id, candidateId), eq(contentCandidates.currentRevision, expectedRevision))).get();
  if (!candidate) throw new Error("Candidate revision is stale or outside this workspace.");
  const nextRevision = expectedRevision + 1; const now = new Date(); const revisionId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.update(contentCandidates).set({ currentRevision: nextRevision, status: "draft_review", updatedAt: now }).where(eq(contentCandidates.id, candidateId));
    await tx.insert(contentRevisions).values({ id: revisionId, candidateId, revisionNumber: nextRevision, contentDigest: digest(`comment:${candidateId}:${nextRevision}:${body}`), mediaDigest: null, accountDigest: null, policyDigest: null, createdAt: now });
    await tx.insert(contentComments).values({ id: crypto.randomUUID(), candidateId, revisionNumber: nextRevision, body, createdAt: now });
    await tx.insert(contentLifecycleEvents).values({ id: crypto.randomUUID(), workspaceId, candidateId, eventType: "comment.revision_created", revisionNumber: nextRevision, traceRef: null, createdAt: now });
  });
  return { revision: nextRevision };
}

export async function getPersonDossier(workspaceId: string, dossierId: string): Promise<PersonDossierResult | null> {
  const dossier = await db.select().from(personDossiers).where(and(eq(personDossiers.workspaceId, workspaceId), eq(personDossiers.id, dossierId))).get();
  if (!dossier) return null;
  const version = await db.select().from(personDossierVersions).where(and(eq(personDossierVersions.dossierId, dossier.id), eq(personDossierVersions.versionNumber, dossier.currentVersion))).get();
  if (!version) return null;
  const claims = await db.select().from(personDossierClaims).where(eq(personDossierClaims.dossierVersionId, version.id));
  const sources = await db.select().from(personDossierSources).where(eq(personDossierSources.dossierVersionId, version.id));
  return { id: dossier.id, version: version.versionNumber, status: dossier.status as DossierStatus, canonicalIdentityKey: dossier.canonicalIdentityKey, displayName: dossier.displayName, sources: sources.map((source) => ({ url: source.url, kind: source.kind as PersonDossierResult["sources"][number]["kind"], capturedAt: source.capturedAt.toISOString() })), claims: claims.map((claim) => ({ statement: claim.statement, sourceUrls: JSON.parse(claim.sourceUrls) as string[] })) };
}
