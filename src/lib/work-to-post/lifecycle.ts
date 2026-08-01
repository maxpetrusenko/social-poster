import crypto from "node:crypto";
import type { DecisionCommand, DecisionOptions, LocalDispatch } from "./contracts";
import type { DispatchScope, WorkToPostRepository } from "./repository";
import { createFakeDispatchAdapter, type DispatchAdapter } from "./dispatch";

function approvalDigest(candidateId: string, command: DecisionCommand, scope: DispatchScope) {
  return crypto.createHash("sha256").update(JSON.stringify({ candidateId, revisionDigest: scope.revisionDigest, mediaDigest: scope.mediaDigest, account: scope.assignedAccount, policy: scope.policyVersion, expiresAt: scope.approvalExpiresAt, command })).digest("hex");
}

function assertDecisionScope(candidateStatus: string, command: DecisionCommand, scope: DispatchScope) {
  if (candidateStatus !== "eligible") throw new Error("Candidate is not eligible for a decision.");
  if (scope.reviewStatus !== "pass" || scope.reviewDigest !== scope.revisionDigest) throw new Error("Passing content review for the exact revision is required.");
  if (!scope.assignedAccount) throw new Error("A concrete assigned account is required.");
  if (!scope.policyVersion || !scope.approvalExpiresAt || Date.parse(scope.approvalExpiresAt) <= Date.now()) throw new Error("Server policy is missing or approval has expired.");
  if (command.type === "approve_schedule" && Date.parse(command.scheduledAt) <= Date.now()) throw new Error("Scheduled time must be in the future.");
}

export async function recordDecision(repository: WorkToPostRepository, workspaceId: string, candidateId: string, command: DecisionCommand, options: DecisionOptions, adapter: DispatchAdapter = createFakeDispatchAdapter((targetWorkspaceId, targetCandidateId, action, digest) => repository.createDispatch(targetWorkspaceId, targetCandidateId, action, digest))): Promise<{ replayed: boolean; dispatch: LocalDispatch; candidate?: { id: string; status: "scheduled" | "published"; currentRevision: number } }> {
  // The receipt identity contains only caller-supplied immutable input. This
  // allows a completed retry to replay even after the candidate's mutable
  // revision, review, policy, or expiry state has changed.
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({
    workspaceId,
    candidateId,
    revision: options.expectedRevision,
    command,
  })).digest("hex");
  const claim = await repository.claimDecision({ workspaceId, candidateId, idempotencyKey: options.idempotencyKey, requestHash, command });
  if (claim.kind === "replay") return { replayed: true, dispatch: { mode: "local_fake", action: claim.decision.command.type === "approve_schedule" ? "simulated_scheduled" : claim.decision.command.type === "approve_now" ? "simulated_published" : "denied", dispatchId: claim.decision.dispatchId } };
  try {
    const candidate = await repository.getCandidate(workspaceId, candidateId);
    if (!candidate) throw new Error("Candidate not found in this workspace.");
    if (candidate.revision !== options.expectedRevision) throw new Error("Candidate revision is stale.");
    const scope = await repository.getDispatchScope(workspaceId, candidateId, candidate.revision);
    if (!scope) throw new Error("Server-owned revision scope is unavailable.");
    assertDecisionScope(candidate.status, command, scope);
    const digest = approvalDigest(candidateId, command, scope);
    const action = command.type === "approve_schedule" ? "simulated_scheduled" : command.type === "approve_now" ? "simulated_published" : "denied";
    const dispatched = await adapter.dispatch({ workspaceId, candidateId, action, idempotencyKey: digest });
    const decision = {
      workspaceId,
      candidateId,
      idempotencyKey: options.idempotencyKey,
      requestHash,
      command,
      dispatchId: dispatched.dispatchId,
      approvalDigest: digest,
    };
    await repository.completeDecision(decision);
    const decidedCandidate = await repository.markDecisionCandidate(workspaceId, candidateId, candidate.revision, command);
    await repository.appendLifecycle({ workspaceId, candidateId, eventType: `decision.${command.type}`, revision: candidate.revision, traceRef: `local-dispatch:${dispatched.dispatchId}` });
    return { replayed: false, dispatch: { mode: "local_fake", action, dispatchId: dispatched.dispatchId }, ...(decidedCandidate ? { candidate: decidedCandidate } : {}) };
  } catch (error) {
    await repository.abandonDecision(workspaceId, options.idempotencyKey, requestHash);
    throw error;
  }
}
