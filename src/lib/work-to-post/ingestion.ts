import { isSafePublicProofUri, type CompletedWorkEventInput, type CompletionIngestResult, type CompletionStatus } from "./contracts";
import type { WorkToPostRepository } from "./repository";
import crypto from "node:crypto";
import { createFixtureProofResolver, type ProofResolver } from "./proof-resolver";
import { scanCompletionPrivacy } from "./privacy-scan";

const PRIVATE_PRIVACY = new Set(["contains_secret", "contains_pii", "private_client"]);
const ENABLED_SOURCES = new Set(["codex", "claude", "cursor", "hermes"]);

function allowedProjects() {
  return new Set((process.env.WORK_TO_POST_ALLOWED_PROJECTS ?? "social-poster").split(",").map((value) => value.trim()).filter(Boolean));
}

function sanitizedInput(input: CompletedWorkEventInput): CompletedWorkEventInput {
  return {
    sourceAgent: input.sourceAgent,
    externalEventId: fingerprint(input.externalEventId),
    sessionRef: fingerprint(input.sessionRef),
    projectRef: input.projectRef,
    summary: redactSummary(input.summary),
    occurredAt: input.occurredAt,
    privacy: input.privacy,
    proof: input.proof.map(({ type, uri, hash, verifiedAt }) => ({ type, uri, ...(hash ? { hash } : {}), ...(verifiedAt ? { verifiedAt } : {}) })),
  };
}

function fingerprint(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function redactSummary(value: string) {
  return value
    .replace(/(?:sk|api)[-_][A-Za-z0-9_-]{8,}|\b[A-Za-z0-9]{32,}\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[redacted]")
    .replace(/(?:^|\s)(?:\/Users\/|\/home\/|C:\\Users\\)\S+/g, " [redacted-path]")
    .replace(/\b(?:token|secret|password|api[_-]?key)\s*=\s*[^\s,;]+/gi, "[redacted-secret]");
}
function tombstone(input: CompletedWorkEventInput): CompletedWorkEventInput {
  return { sourceAgent: input.sourceAgent, externalEventId: input.externalEventId, sessionRef: "[blocked]", projectRef: "[blocked]", summary: "[blocked]", occurredAt: input.occurredAt, privacy: input.privacy, proof: [] };
}

export async function ingestCompletedWork(repository: WorkToPostRepository, workspaceId: string, input: CompletedWorkEventInput, resolver: ProofResolver = createFixtureProofResolver()): Promise<CompletionIngestResult> {
  if (!ENABLED_SOURCES.has(input.sourceAgent)) throw new Error("Source adapter is not enabled for V1.");
  if (!allowedProjects().has(input.projectRef)) throw new Error("Project is not allowlisted for work-to-post intake.");
  const safeInput = sanitizedInput(input);
  const hasUnsafeProof = safeInput.proof.some((proof) => !isSafePublicProofUri(proof.uri));
  const scan = scanCompletionPrivacy(input);
  const verified = hasUnsafeProof ? false : (await Promise.all(safeInput.proof.map((proof) => resolver.verify(proof)))).some(Boolean);
  const status: CompletionStatus = scan.blocked || PRIVATE_PRIVACY.has(safeInput.privacy) || hasUnsafeProof ? "blocked_privacy" : verified ? "eligible" : "needs_proof";
  return repository.ingestCompletion(workspaceId, status === "blocked_privacy" ? tombstone(safeInput) : safeInput, status);
}
