import crypto from "node:crypto";
import type { CompletedWorkEventInput, CompletionIngestResult, CompletionStatus, DecisionCommand, DossierStatus, PersonDossierInput, PersonDossierResult } from "./contracts";

export type CompletionRecord = { id: string; workspaceId: string; input: CompletedWorkEventInput; status: CompletionStatus };
export type CandidateRecord = { id: string; workspaceId: string; completionEventId: string; status: string; revision: number };
export type LifecycleRecord = { id: string; workspaceId: string; candidateId: string; eventType: string; revision: number; traceRef: string | null; createdAt: string };
export type DispatchScope = { revisionDigest: string; mediaDigest: string; assignedAccount: string | null; policyVersion: string | null; approvalExpiresAt: string | null; reviewStatus: string | null; reviewDigest: string | null; candidateStatus: string };
export type DecisionRecord = { id: string; workspaceId: string; candidateId: string; idempotencyKey: string; requestHash: string; command: DecisionCommand; dispatchId: string };
export type DecisionResultCandidate = { id: string; status: "scheduled" | "published"; currentRevision: number };
export type DecisionClaim = { kind: "claimed" } | { kind: "replay"; decision: DecisionRecord };

export interface WorkToPostRepository {
  findCompletion(workspaceId: string, sourceAgent: string, externalEventId: string): Promise<CompletionRecord | null>;
  ingestCompletion(workspaceId: string, input: CompletedWorkEventInput, status: CompletionStatus): Promise<CompletionIngestResult>;
  createCompletion(workspaceId: string, input: CompletedWorkEventInput, status: CompletionStatus): Promise<CompletionRecord>;
  createCandidate(workspaceId: string, completionEventId: string, status: string): Promise<CandidateRecord>;
  findCandidateByCompletion(workspaceId: string, completionEventId: string): Promise<CandidateRecord | null>;
  getCandidate(workspaceId: string, candidateId: string): Promise<CandidateRecord | null>;
  appendLifecycle(record: Omit<LifecycleRecord, "id" | "createdAt">): Promise<LifecycleRecord>;
  claimDecision(input: Omit<DecisionRecord, "id" | "dispatchId">): Promise<DecisionClaim>;
  completeDecision(input: Omit<DecisionRecord, "id">): Promise<DecisionRecord>;
  markDecisionCandidate(workspaceId: string, candidateId: string, revision: number, command: DecisionCommand): Promise<DecisionResultCandidate | null>;
  abandonDecision(workspaceId: string, idempotencyKey: string, requestHash: string): Promise<void>;
  createDispatch(workspaceId: string, candidateId: string, action: "simulated_scheduled" | "simulated_published" | "denied", approvalDigest: string): Promise<string>;
  getDispatchScope(workspaceId: string, candidateId: string, revision: number): Promise<DispatchScope | null>;
  upsertDossier(workspaceId: string, input: PersonDossierInput, status: DossierStatus): Promise<PersonDossierResult>;
}

export function createInMemoryWorkToPostRepository(): WorkToPostRepository & { count(kind: "completionEvents" | "candidates" | "dispatches"): Promise<number>; serializedState(): Promise<string> } {
  const completions: CompletionRecord[] = [];
  const candidates: CandidateRecord[] = [];
  const lifecycle: LifecycleRecord[] = [];
  const decisions: DecisionRecord[] = [];
  const claims = new Map<string, Omit<DecisionRecord, "id" | "dispatchId">>();
  const dossiers: PersonDossierResult[] = [];
  const dispatches: Array<{ id: string; workspaceId: string; candidateId: string; action: string; approvalDigest: string }> = [];
  let serial = Promise.resolve();
  const exclusive = async <T>(fn: () => Promise<T> | T) => { const previous = serial; let release!: () => void; serial = new Promise<void>((resolve) => { release = resolve; }); await previous; try { return await fn(); } finally { release(); } };
  return {
    async findCompletion(workspaceId, sourceAgent, externalEventId) { return completions.find((entry) => entry.workspaceId === workspaceId && entry.input.sourceAgent === sourceAgent && entry.input.externalEventId === externalEventId) ?? null; },
    async ingestCompletion(workspaceId, input, status) { return exclusive(async () => { const existing = completions.find((entry) => entry.workspaceId === workspaceId && entry.input.sourceAgent === input.sourceAgent && entry.input.externalEventId === input.externalEventId); if (existing) { const candidate = candidates.find((entry) => entry.workspaceId === workspaceId && entry.completionEventId === existing.id); return { status: existing.status, completionEventId: existing.id, candidateId: candidate?.id ?? null, replayed: true }; } const completion = { id: crypto.randomUUID(), workspaceId, input, status }; completions.push(completion); lifecycle.push({ id: crypto.randomUUID(), workspaceId, candidateId: completion.id, eventType: `completion.${status}`, revision: 0, traceRef: null, createdAt: new Date().toISOString() }); if (status === "blocked_privacy") return { status, completionEventId: completion.id, candidateId: null, replayed: false }; const candidate = { id: crypto.randomUUID(), workspaceId, completionEventId: completion.id, status: status === "eligible" ? "eligible" : "needs_proof", revision: 1 }; candidates.push(candidate); lifecycle.push({ id: crypto.randomUUID(), workspaceId, candidateId: candidate.id, eventType: "candidate.created", revision: 1, traceRef: `completion:${completion.id}`, createdAt: new Date().toISOString() }); return { status, completionEventId: completion.id, candidateId: candidate.id, replayed: false }; }); },
    async createCompletion(workspaceId, input, status) { const record = { id: crypto.randomUUID(), workspaceId, input, status }; completions.push(record); return record; },
    async createCandidate(workspaceId, completionEventId, status) { const record = { id: crypto.randomUUID(), workspaceId, completionEventId, status, revision: 1 }; candidates.push(record); return record; },
    async findCandidateByCompletion(workspaceId, completionEventId) { return candidates.find((entry) => entry.workspaceId === workspaceId && entry.completionEventId === completionEventId) ?? null; },
    async getCandidate(workspaceId, candidateId) { return candidates.find((entry) => entry.workspaceId === workspaceId && entry.id === candidateId) ?? null; },
    async appendLifecycle(record) { const saved = { ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; lifecycle.push(saved); return saved; },
    async claimDecision(input) { return exclusive(async () => { const key = `${input.workspaceId}:${input.idempotencyKey}`; const claimed = claims.get(key); if (claimed) { if (claimed.requestHash !== input.requestHash || claimed.candidateId !== input.candidateId || JSON.stringify(claimed.command) !== JSON.stringify(input.command)) throw new Error("Idempotency key was already used for a different request."); const decision = decisions.find((item) => item.workspaceId === input.workspaceId && item.idempotencyKey === input.idempotencyKey); if (!decision) throw new Error("Idempotency request is in progress."); return { kind: "replay", decision }; } claims.set(key, input); return { kind: "claimed" }; }); },
    async completeDecision(input) { return exclusive(async () => { const existing = decisions.find((item) => item.workspaceId === input.workspaceId && item.idempotencyKey === input.idempotencyKey); if (existing) return existing; const saved = { ...input, id: crypto.randomUUID() }; decisions.push(saved); return saved; }); },
    async markDecisionCandidate(workspaceId, candidateId, revision, command) { return exclusive(async () => {
      const candidate = candidates.find((entry) => entry.workspaceId === workspaceId && entry.id === candidateId && entry.revision === revision);
      if (!candidate || command.type === "deny") return null;
      candidate.status = command.type === "approve_schedule" ? "scheduled" : "published";
      return { id: candidate.id, status: candidate.status as "scheduled" | "published", currentRevision: candidate.revision };
    }); },
    async abandonDecision(workspaceId, idempotencyKey, requestHash) { return exclusive(async () => { const key = `${workspaceId}:${idempotencyKey}`; const claimed = claims.get(key); const completed = decisions.some((decision) => decision.workspaceId === workspaceId && decision.idempotencyKey === idempotencyKey && decision.requestHash === requestHash); if (!completed && claimed?.requestHash === requestHash) claims.delete(key); }); },
    async createDispatch(workspaceId, candidateId, action, approvalDigest) { return exclusive(async () => { const existing = dispatches.find((entry) => entry.workspaceId === workspaceId && entry.approvalDigest === approvalDigest); if (existing) return existing.id; const id = crypto.randomUUID(); dispatches.push({ id, workspaceId, candidateId, action, approvalDigest }); return id; }); },
    async getDispatchScope(workspaceId, candidateId, revision) { const candidate = candidates.find((entry) => entry.workspaceId === workspaceId && entry.id === candidateId && entry.revision === revision); return candidate ? { revisionDigest: `revision:${candidate.id}:${revision}`, mediaDigest: "media:fixture", assignedAccount: "fixture-account", policyVersion: "v1", approvalExpiresAt: "2099-01-01T00:00:00.000Z", reviewStatus: "pass", reviewDigest: `revision:${candidate.id}:${revision}`, candidateStatus: candidate.status } : null; },
    async upsertDossier(workspaceId, input, status) { const existing = dossiers.find((entry) => entry.canonicalIdentityKey === input.canonicalIdentityKey && (entry as PersonDossierResult & { workspaceId?: string }).workspaceId === workspaceId); const result = { id: existing?.id ?? crypto.randomUUID(), version: (existing?.version ?? 0) + 1, status, ...input, workspaceId } as PersonDossierResult & { workspaceId: string }; if (existing) dossiers.splice(dossiers.indexOf(existing), 1, result); else dossiers.push(result); return result; },
    async count(kind) { return kind === "completionEvents" ? completions.length : kind === "candidates" ? candidates.length : dispatches.length; },
    async serializedState() { return JSON.stringify({ completions, candidates, lifecycle, decisions, dossiers, dispatches }); },
  };
}
