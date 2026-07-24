import "server-only";

import crypto from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  commandReceipts,
  contentAngles,
  contentCandidates,
  contentComments,
  contentDecisions,
  contentLifecycleEvents,
  contentRevisions,
  learningProposals,
  learningRuleVersions,
  referenceExamples,
} from "@/db/schema";

import { createAnglesForCandidate, type ContentAngle } from "./angles";
import { deriveCandidateLearningPolicy } from "./learning-policy";
import {
  BOARDY_INSPIRED_MECHANISMS,
  normalizeVerifiedBoardyStatusUrl,
  type BoardyInspiredMechanism,
} from "./reference-examples";

type StoredReceipt<T> = T & { replayed: boolean };
type WriteSession = Pick<typeof db, "select" | "insert" | "update">;

export type CandidateAngleReferenceInput = {
  sourceUrl: string;
  author: string;
  capturedAt: string;
  mechanism: BoardyInspiredMechanism;
};

export type LearningProposalRecord = {
  id: string;
  workspaceId: string;
  candidateId: string;
  status: "proposed" | "promoted" | "rolled_back";
  version: number;
  reasonCodes: string[];
  scope: "candidate";
  trait: string | null;
  direction: string | null;
  evidence: string[];
  confidence: number;
  expiresAt: string | null;
  createdAt: string;
};

export class WorkToPostNotFoundError extends Error {}
export class WorkToPostConflictError extends Error {}

export async function persistCandidateAngles(input: {
  workspaceId: string;
  candidateId: string;
  expectedRevision: number;
  idempotencyKey: string;
  summary: string;
  references: CandidateAngleReferenceInput[];
}): Promise<StoredReceipt<{ angles: ContentAngle[] }>> {
  const summary = input.summary.trim();
  if (!summary) throw new Error("A candidate summary is required.");
  const references = normalizeReferences(input.references);
  const requestHash = hash({ operation: "candidate.angles", candidateId: input.candidateId, expectedRevision: input.expectedRevision, summary, references });

  return db.transaction((tx) => {
    const replay = replayReceipt<{ angles: ContentAngle[] }>(tx, input.workspaceId, "candidate.angles", input.idempotencyKey, requestHash);
    if (replay) return replay;

    requireCandidateRevision(tx, input.workspaceId, input.candidateId, input.expectedRevision);
    const existing = tx.select({ id: contentAngles.id }).from(contentAngles)
      .where(and(eq(contentAngles.candidateId, input.candidateId), eq(contentAngles.revisionNumber, input.expectedRevision))).all();
    if (existing.length > 0) throw new WorkToPostConflictError("Candidate angles already exist for this revision.");

    const now = new Date();
    const savedReferences = references.map((reference) => ({ id: crypto.randomUUID(), workspaceId: input.workspaceId, sourceUrl: reference.sourceUrl, author: reference.author, capturedAt: parseDate(reference.capturedAt), mechanism: reference.mechanism, createdAt: now }));
    const angles = createAnglesForCandidate({
      candidateId: input.candidateId,
      revision: input.expectedRevision,
      summary,
      references: savedReferences.map((reference) => ({ id: reference.id, sourceUrl: reference.sourceUrl, mechanism: reference.mechanism as BoardyInspiredMechanism })),
    });
    tx.insert(referenceExamples).values(savedReferences).run();
    tx.insert(contentAngles).values(angles.map((angle) => ({
      id: crypto.randomUUID(),
      candidateId: angle.candidateId,
      revisionNumber: angle.revision,
      title: angle.title,
      provenance: JSON.stringify(angle.provenance),
      createdAt: now,
    }))).run();
    const result = { angles };
    writeReceipt(tx, { workspaceId: input.workspaceId, operation: "candidate.angles", candidateId: input.candidateId, revisionNumber: input.expectedRevision, commandType: "angles", scopeDigest: hash({ candidateId: input.candidateId, revision: input.expectedRevision }), idempotencyKey: input.idempotencyKey, requestHash, response: result, createdAt: now });
    return { ...result, replayed: false };
  });
}

export async function appendCandidateComment(input: {
  workspaceId: string;
  candidateId: string;
  expectedRevision: number;
  idempotencyKey: string;
  body: string;
}): Promise<StoredReceipt<{ revision: number; commentId: string; approvalInvalidated: true }>> {
  const body = input.body.trim();
  if (!body) throw new Error("A comment body is required.");
  const requestHash = hash({ operation: "candidate.comment", candidateId: input.candidateId, expectedRevision: input.expectedRevision, body });

  return db.transaction((tx) => {
    const replay = replayReceipt<{ revision: number; commentId: string; approvalInvalidated: true }>(tx, input.workspaceId, "candidate.comment", input.idempotencyKey, requestHash);
    if (replay) return replay;

    const candidate = requireCandidateRevision(tx, input.workspaceId, input.candidateId, input.expectedRevision);
    const priorRevision = tx.select().from(contentRevisions)
      .where(and(eq(contentRevisions.candidateId, input.candidateId), eq(contentRevisions.revisionNumber, input.expectedRevision))).get();
    if (!priorRevision) throw new WorkToPostConflictError("Candidate revision is unavailable.");

    const revision = input.expectedRevision + 1;
    const now = new Date();
    const commentId = crypto.randomUUID();
    tx.update(contentCandidates).set({ currentRevision: revision, status: "draft_review", updatedAt: now })
      .where(and(eq(contentCandidates.id, candidate.id), eq(contentCandidates.workspaceId, input.workspaceId), eq(contentCandidates.currentRevision, input.expectedRevision))).run();
    tx.insert(contentRevisions).values({
      id: crypto.randomUUID(),
      candidateId: input.candidateId,
      revisionNumber: revision,
      contentDigest: hash({ parentDigest: priorRevision.contentDigest, comment: body }),
      mediaDigest: priorRevision.mediaDigest,
      accountDigest: priorRevision.accountDigest,
      policyDigest: priorRevision.policyDigest,
      createdAt: now,
    }).run();
    tx.insert(contentComments).values({ id: commentId, candidateId: input.candidateId, revisionNumber: revision, body, createdAt: now }).run();
    tx.insert(contentLifecycleEvents).values([
      { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, eventType: "comment.revision_created", revisionNumber: revision, traceRef: null, createdAt: now },
      { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, eventType: "approval.invalidated", revisionNumber: revision, traceRef: null, createdAt: now },
    ]).run();
    const result = { revision, commentId, approvalInvalidated: true as const };
    writeReceipt(tx, { workspaceId: input.workspaceId, operation: "candidate.comment", candidateId: input.candidateId, revisionNumber: revision, commandType: "comment", scopeDigest: hash({ candidateId: input.candidateId, revision: input.expectedRevision }), idempotencyKey: input.idempotencyKey, requestHash, response: result, createdAt: now });
    return { ...result, replayed: false };
  });
}

export async function createLearningProposalFromDenial(input: {
  workspaceId: string;
  candidateId: string;
  expectedRevision: number;
  idempotencyKey: string;
  reasonCodes: string[];
  trait?: string;
  direction?: string;
  evidence?: string[];
  confidence?: number;
  expiresAt?: string;
}): Promise<StoredReceipt<{ proposal: LearningProposalRecord; candidate: { id: string; status: "rejected"; currentRevision: number } }>> {
  const policy = deriveCandidateLearningPolicy(input.reasonCodes);
  const details = normalizeLearningDetails(input);
  const requestHash = hash({ operation: "candidate.denial", candidateId: input.candidateId, expectedRevision: input.expectedRevision, reasonCodes: policy.reasonCodes, ...details });

  return db.transaction((tx) => {
    const replay = replayReceipt<{ proposal: LearningProposalRecord; candidate: { id: string; status: "rejected"; currentRevision: number } }>(tx, input.workspaceId, "candidate.denial", input.idempotencyKey, requestHash);
    if (replay) return replay;

    const candidate = requireCandidateRevision(tx, input.workspaceId, input.candidateId, input.expectedRevision);
    const now = new Date();
    const proposalId = crypto.randomUUID();
    tx.update(contentCandidates).set({ status: "rejected", updatedAt: now })
      .where(and(eq(contentCandidates.id, candidate.id), eq(contentCandidates.workspaceId, input.workspaceId), eq(contentCandidates.currentRevision, input.expectedRevision))).run();
    tx.insert(contentDecisions).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, commandType: "deny", requestHash, createdAt: now }).run();
    tx.insert(learningProposals).values({ id: proposalId, workspaceId: input.workspaceId, candidateId: input.candidateId, status: "proposed", reasonCodes: JSON.stringify(policy.reasonCodes), scope: "candidate", traitKey: details.trait, direction: details.direction, evidenceEventIds: JSON.stringify(details.evidence), confidence: details.confidence, expiresAt: details.expiresAt, createdAt: now }).run();
    tx.insert(learningRuleVersions).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, proposalId, versionNumber: 1, status: "proposed", scope: "candidate", trait: details.trait, direction: details.direction, evidence: JSON.stringify(details.evidence), confidence: details.confidence, expiresAt: details.expiresAt, createdAt: now }).run();
    tx.insert(contentLifecycleEvents).values([
      { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, eventType: "decision.deny", revisionNumber: input.expectedRevision, traceRef: `learning-proposal:${proposalId}`, createdAt: now },
      { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, eventType: "candidate.rejected", revisionNumber: input.expectedRevision, traceRef: null, createdAt: now },
      { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, eventType: "approval.invalidated", revisionNumber: input.expectedRevision, traceRef: null, createdAt: now },
      { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, eventType: "learning.proposed", revisionNumber: input.expectedRevision, traceRef: `learning-proposal:${proposalId}`, createdAt: now },
    ]).run();
    const result = { candidate: { id: candidate.id, status: "rejected" as const, currentRevision: candidate.currentRevision }, proposal: { id: proposalId, workspaceId: input.workspaceId, candidateId: input.candidateId, status: "proposed" as const, version: 1, reasonCodes: policy.reasonCodes, scope: "candidate" as const, ...detailsToRecord(details), createdAt: now.toISOString() } };
    writeReceipt(tx, { workspaceId: input.workspaceId, operation: "candidate.denial", candidateId: input.candidateId, revisionNumber: input.expectedRevision, commandType: "deny", scopeDigest: hash({ candidateId: input.candidateId, revision: input.expectedRevision }), idempotencyKey: input.idempotencyKey, requestHash, response: result, createdAt: now });
    return { ...result, replayed: false };
  });
}

export async function listLearningProposals(workspaceId: string): Promise<LearningProposalRecord[]> {
  const proposals = await db.select().from(learningProposals).where(eq(learningProposals.workspaceId, workspaceId)).orderBy(asc(learningProposals.createdAt));
  return Promise.all(proposals.map(async (proposal) => {
    const version = await db.select().from(learningRuleVersions)
      .where(and(eq(learningRuleVersions.workspaceId, workspaceId), eq(learningRuleVersions.proposalId, proposal.id)))
      .orderBy(desc(learningRuleVersions.versionNumber)).get();
    if (!version) throw new WorkToPostConflictError("Learning proposal version is unavailable.");
    return toLearningProposalRecord(proposal, version);
  }));
}

export async function transitionLearningProposal(input: {
  workspaceId: string;
  proposalId: string;
  expectedVersion: number;
  idempotencyKey: string;
  action: "promote" | "rollback";
}): Promise<StoredReceipt<{ proposal: LearningProposalRecord }>> {
  const requestHash = hash({ operation: `learning.${input.action}`, proposalId: input.proposalId, expectedVersion: input.expectedVersion });
  const status: LearningProposalRecord["status"] = input.action === "promote" ? "promoted" : "rolled_back";

  return db.transaction((tx) => {
    const replay = replayReceipt<{ proposal: LearningProposalRecord }>(tx, input.workspaceId, `learning.${input.action}`, input.idempotencyKey, requestHash);
    if (replay) return replay;

    const proposal = tx.select().from(learningProposals)
      .where(and(eq(learningProposals.workspaceId, input.workspaceId), eq(learningProposals.id, input.proposalId))).get();
    if (!proposal) throw new WorkToPostNotFoundError("Learning proposal was not found in this workspace.");
    const version = tx.select().from(learningRuleVersions)
      .where(and(eq(learningRuleVersions.workspaceId, input.workspaceId), eq(learningRuleVersions.proposalId, input.proposalId)))
      .orderBy(desc(learningRuleVersions.versionNumber)).get();
    if (!version || version.versionNumber !== input.expectedVersion) throw new WorkToPostConflictError("Learning proposal version is stale.");

    const now = new Date();
    const nextVersion = version.versionNumber + 1;
    tx.insert(learningRuleVersions).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, proposalId: input.proposalId, versionNumber: nextVersion, status, scope: version.scope, trait: version.trait, direction: version.direction, evidence: version.evidence, confidence: version.confidence, expiresAt: version.expiresAt, createdAt: now }).run();
    tx.update(learningProposals).set({ status }).where(and(eq(learningProposals.id, input.proposalId), eq(learningProposals.workspaceId, input.workspaceId))).run();
    const result = { proposal: { ...toLearningProposalRecord(proposal, version), status, version: nextVersion } };
    writeReceipt(tx, { workspaceId: input.workspaceId, operation: `learning.${input.action}`, candidateId: proposal.candidateId, revisionNumber: input.expectedVersion, commandType: input.action, scopeDigest: hash({ proposalId: input.proposalId, version: input.expectedVersion }), idempotencyKey: input.idempotencyKey, requestHash, response: result, createdAt: now });
    return { ...result, replayed: false };
  });
}

function normalizeReferences(references: CandidateAngleReferenceInput[]): CandidateAngleReferenceInput[] {
  if (!Array.isArray(references) || references.length !== 3) throw new Error("Exactly three reference examples are required.");
  return references.map((reference) => {
    const sourceUrl = reference.sourceUrl?.trim();
    const author = reference.author?.trim();
    if (!sourceUrl || !author || !BOARDY_INSPIRED_MECHANISMS.includes(reference.mechanism)) throw new Error("Reference example is invalid.");
    const verifiedSourceUrl = normalizeVerifiedBoardyStatusUrl(sourceUrl, author);
    parseDate(reference.capturedAt);
    return {
      sourceUrl: verifiedSourceUrl,
      author: "@boardyai",
      capturedAt: reference.capturedAt,
      mechanism: reference.mechanism,
    };
  });
}

function normalizeLearningDetails(input: { trait?: string; direction?: string; evidence?: string[]; confidence?: number; expiresAt?: string }) {
  const trait = input.trait?.trim() || null;
  const direction = input.direction?.trim() || null;
  const evidence = [...new Set((input.evidence ?? []).map((item) => item.trim()).filter(Boolean))];
  const confidence = input.confidence ?? 0;
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) throw new Error("Learning confidence must be an integer from 0 to 100.");
  const expiresAt = input.expiresAt ? parseDate(input.expiresAt) : null;
  return { trait, direction, evidence, confidence, expiresAt };
}

function detailsToRecord(details: { trait: string | null; direction: string | null; evidence: string[]; confidence: number; expiresAt: Date | null }) {
  return { trait: details.trait, direction: details.direction, evidence: details.evidence, confidence: details.confidence, expiresAt: details.expiresAt?.toISOString() ?? null };
}

function toLearningProposalRecord(
  proposal: typeof learningProposals.$inferSelect,
  version: typeof learningRuleVersions.$inferSelect,
): LearningProposalRecord {
  return {
    id: proposal.id,
    workspaceId: proposal.workspaceId,
    candidateId: proposal.candidateId,
    status: proposal.status as LearningProposalRecord["status"],
    version: version.versionNumber,
    reasonCodes: parseJsonArray(proposal.reasonCodes),
    scope: "candidate",
    trait: version.trait,
    direction: version.direction,
    evidence: parseJsonArray(version.evidence),
    confidence: version.confidence,
    expiresAt: version.expiresAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
  };
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function requireCandidateRevision(tx: WriteSession, workspaceId: string, candidateId: string, expectedRevision: number) {
  const candidate = tx.select().from(contentCandidates)
    .where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.id, candidateId), eq(contentCandidates.currentRevision, expectedRevision))).get();
  if (!candidate) {
    const exists = tx.select({ id: contentCandidates.id }).from(contentCandidates)
      .where(and(eq(contentCandidates.workspaceId, workspaceId), eq(contentCandidates.id, candidateId))).get();
    if (!exists) throw new WorkToPostNotFoundError("Candidate was not found in this workspace.");
    throw new WorkToPostConflictError("Candidate revision is stale.");
  }
  return candidate;
}

function replayReceipt<T>(tx: WriteSession, workspaceId: string, operation: string, idempotencyKey: string, requestHash: string): StoredReceipt<T> | null {
  const receipt = tx.select().from(commandReceipts)
    .where(and(eq(commandReceipts.workspaceId, workspaceId), eq(commandReceipts.operation, operation), eq(commandReceipts.idempotencyKey, idempotencyKey))).get();
  if (!receipt) return null;
  if (receipt.requestHash !== requestHash) throw new WorkToPostConflictError("Idempotency key was already used for a different request.");
  if (receipt.state !== "completed" || !receipt.response) {
    throw new WorkToPostConflictError("Idempotent request is still processing.");
  }
  return { ...(JSON.parse(receipt.response) as T), replayed: true };
}

function writeReceipt(tx: WriteSession, input: { workspaceId: string; operation: string; candidateId: string; revisionNumber: number; commandType: string; scopeDigest: string; idempotencyKey: string; requestHash: string; response: unknown; createdAt: Date }) {
  tx.insert(commandReceipts).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    operation: input.operation,
    candidateId: input.candidateId,
    revisionNumber: input.revisionNumber,
    commandType: input.commandType,
    scopeDigest: input.scopeDigest,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    state: "completed",
    leaseExpiresAt: null,
    attempts: 1,
    response: JSON.stringify(input.response),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }).run();
}

function parseDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid ISO timestamp.");
  return parsed;
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
