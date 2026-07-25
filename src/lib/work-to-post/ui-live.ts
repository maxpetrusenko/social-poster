export type UiCompletionProof = {
  type: string;
  uri: string;
  hash?: string | null;
  verifiedAt?: string | null;
};

export type UiLiveCandidate = {
  id: string;
  status: string;
  currentRevision: number;
  createdAt?: string;
  sourceAgent?: string | null;
  projectRef?: string | null;
  summary?: string | null;
  occurredAt?: string | null;
  privacy?: string | null;
  proof?: UiCompletionProof[];
};
export type UiLiveTimeline = {
  candidate: UiLiveCandidate;
  completion?: {
    sourceAgent: string;
    projectRef: string;
    summary: string;
    occurredAt: string;
    privacy: string;
    proof: UiCompletionProof[];
  } | null;
  timeline: Array<{ id?: string; eventType?: string; revisionNumber?: number; createdAt?: string; traceRef?: string | null }>;
  angles: Array<{ id?: string; title?: string; provenance?: string }>;
  comments: Array<{ id?: string; body?: string; revisionNumber?: number; createdAt?: string }>;
  revisions: Array<{ id?: string; revisionNumber?: number; createdAt?: string }>;
  release?: {
    allowed: boolean;
    reason: string | null;
    account: string | null;
    policyVersion: string | null;
    approvalExpiresAt: string | null;
    reviewStatus: string | null;
  };
};
export type UiLearningProposal = { id: string; candidateId: string; status: string; version: number; reasonCodes: string[] };

export class WorkToPostUiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function workToPostFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new WorkToPostUiError(response.status, errorMessage(body, response.statusText));
  return body as T;
}

export function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `work-to-post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function candidateRevision(value: unknown): number | null {
  return isRecord(value) && Number.isInteger(value.currentRevision) && Number(value.currentRevision) > 0 ? Number(value.currentRevision) : null;
}

export function errorMessage(value: unknown, fallback = "The workspace request was rejected.") {
  return isRecord(value) && typeof value.error === "string" && value.error.trim() ? value.error : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
