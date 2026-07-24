import crypto from "node:crypto";

export type CandidateApproval = "approved" | "invalidated" | "pending";
export type FeedbackCandidate = { candidateId: string; workspaceId: string; revision: number; approval: CandidateApproval };
export type ContentComment = { id: string; candidateId: string; revision: number; body: string; createdAt: string };
export type CandidateFeedbackStore = { candidates: FeedbackCandidate[]; comments: ContentComment[]; approvalCalls: string[] };

export function createCandidateFeedbackStore(candidates: FeedbackCandidate[] = []): CandidateFeedbackStore {
  return { candidates: [...candidates], comments: [], approvalCalls: [] };
}

export function addComment(store: CandidateFeedbackStore, input: {
  workspaceId: string;
  candidateId: string;
  expectedRevision: number;
  body: string;
}): FeedbackCandidate & { approvalInvalidated: true; comment: ContentComment } {
  const candidate = store.candidates.find((entry) => entry.candidateId === input.candidateId && entry.workspaceId === input.workspaceId);
  if (!candidate) throw new Error("Candidate was not found in this workspace.");
  if (candidate.revision !== input.expectedRevision) throw new Error("Candidate revision is stale.");
  const body = input.body.trim();
  if (!body) throw new Error("A comment body is required.");

  candidate.revision += 1;
  candidate.approval = "invalidated";
  const comment = { id: crypto.randomUUID(), candidateId: candidate.candidateId, revision: candidate.revision, body, createdAt: new Date().toISOString() };
  store.comments.push(comment);
  return { ...candidate, approvalInvalidated: true, comment };
}
