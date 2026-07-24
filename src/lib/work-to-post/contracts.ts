export const COMPLETION_PRIVACY = [
  "public_safe",
  "needs_review",
  "contains_secret",
  "contains_pii",
  "private_client",
] as const;
export type CompletionPrivacy = (typeof COMPLETION_PRIVACY)[number];

export const PROOF_TYPES = ["commit", "pr", "test", "deploy", "benchmark", "artifact"] as const;
export type ProofType = (typeof PROOF_TYPES)[number];

export type CompletedWorkEventInput = {
  sourceAgent: "codex" | "claude" | "cursor" | "hermes";
  externalEventId: string;
  sessionRef: string;
  projectRef: string;
  summary: string;
  occurredAt: string;
  privacy: CompletionPrivacy;
  proof: Array<{ type: ProofType; uri: string; hash?: string; verifiedAt?: string }>;
};

export type CompletionStatus = "eligible" | "needs_proof" | "blocked_privacy";
export type CompletionIngestResult = {
  status: CompletionStatus;
  completionEventId: string;
  candidateId: string | null;
  replayed: boolean;
};

export type DossierSourceKind = "primary_profile" | "first_party_activity" | "professional_source";
export type PersonDossierInput = {
  canonicalIdentityKey: string;
  displayName: string;
  sources: Array<{ url: string; kind: DossierSourceKind; capturedAt: string }>;
  claims: Array<{ statement: string; sourceUrls: string[] }>;
  ambiguous?: boolean;
};
export type DossierStatus = "clear" | "blocked_ambiguous" | "blocked_stale" | "blocked_insufficient_sources";
export type PersonDossierResult = PersonDossierInput & { id: string; version: number; status: DossierStatus };

export type DecisionCommand =
  | { type: "deny"; reasonCodes: string[] }
  | { type: "approve_schedule"; scheduledAt: string }
  | { type: "approve_now" };

export type DecisionOptions = { idempotencyKey: string; expectedRevision: number };
export type LocalDispatch = { mode: "local_fake"; action: "simulated_scheduled" | "simulated_published" | "denied"; dispatchId: string };

export function parseCompletedWorkEvent(value: unknown): CompletedWorkEventInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    !["codex", "claude", "cursor", "hermes"].includes(String(input.sourceAgent)) ||
    !COMPLETION_PRIVACY.includes(input.privacy as CompletionPrivacy) ||
    !Array.isArray(input.proof)
  ) return null;
  const strings = ["externalEventId", "sessionRef", "projectRef", "summary", "occurredAt"];
  if (strings.some((key) => typeof input[key] !== "string" || !String(input[key]).trim())) return null;
  const proof = input.proof.map((entry) => entry as Record<string, unknown>);
  if (proof.some((entry) => !PROOF_TYPES.includes(entry.type as ProofType) || typeof entry.uri !== "string" || !entry.uri.trim())) return null;
  return {
    sourceAgent: input.sourceAgent as CompletedWorkEventInput["sourceAgent"],
    externalEventId: String(input.externalEventId).trim(),
    sessionRef: String(input.sessionRef).trim(),
    projectRef: String(input.projectRef).trim(),
    summary: String(input.summary).trim(),
    occurredAt: String(input.occurredAt),
    privacy: input.privacy as CompletionPrivacy,
    proof: proof.map((entry) => ({ type: entry.type as ProofType, uri: String(entry.uri).trim(), ...(typeof entry.hash === "string" ? { hash: entry.hash } : {}), ...(typeof entry.verifiedAt === "string" ? { verifiedAt: entry.verifiedAt } : {}) })),
  };
}

export function isSafePublicProofUri(value: string) {
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" && !uri.username && !uri.password && !uri.search && !uri.hash && !/(^|\/)\.(git|env)(\/|$)|\/private(\/|$)|\/tmp(\/|$)/i.test(uri.pathname);
  } catch {
    return false;
  }
}
