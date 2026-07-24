import crypto from "node:crypto";

import { deriveCandidateLearningPolicy, type LearningScope } from "./learning-policy";

export type LearningProposalStatus = "proposed" | "promoted" | "rolled_back";
export type LearningProposal = {
  id: string;
  workspaceId: string;
  candidateId: string;
  scope: LearningScope;
  reasonCodes: string[];
  status: LearningProposalStatus;
  version: number;
};
export type LearningStore = { proposals: LearningProposal[] };

export function createLearningStore(): LearningStore {
  return { proposals: [] };
}

export function createScopedLearningProposalFromDenial(store: LearningStore, input: {
  workspaceId: string;
  candidateId: string;
  reasonCodes: string[];
}): LearningProposal {
  const policy = deriveCandidateLearningPolicy(input.reasonCodes);
  const proposal: LearningProposal = { id: crypto.randomUUID(), workspaceId: input.workspaceId, candidateId: input.candidateId, status: "proposed", version: 1, ...policy };
  store.proposals.push(proposal);
  return { ...proposal };
}

function transition(store: LearningStore, input: { workspaceId: string; proposalId: string; expectedVersion: number }, status: "promoted" | "rolled_back") {
  const proposal = store.proposals.find((entry) => entry.id === input.proposalId);
  if (!proposal || proposal.workspaceId !== input.workspaceId) throw new Error("Learning proposal was not found in this workspace.");
  if (proposal.version !== input.expectedVersion) throw new Error("Learning proposal version is stale.");
  proposal.version += 1;
  proposal.status = status;
  return { ...proposal };
}

export function promoteLearningProposal(store: LearningStore, input: { workspaceId: string; proposalId: string; expectedVersion: number }) {
  return transition(store, input, "promoted");
}

export function rollbackLearningProposal(store: LearningStore, input: { workspaceId: string; proposalId: string; expectedVersion: number }) {
  return transition(store, input, "rolled_back");
}
