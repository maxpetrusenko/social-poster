import type { CompletedWorkEventInput } from "./contracts";

// This is deliberately server-owned. A caller's `privacy` field is only one
// signal; raw work which looks private must never become a review candidate.
const PRIVATE_PATH = /(?:^|[\s"'])(?:\/Users\/|\/home\/|C:\\Users\\|~\/|\.env(?:\.|\b)|\/private\/|\/tmp\/)/i;
const SECRET = /(?:\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*[^\s,;]+|\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{8,}\b|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/i;
const PII = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/i;
const PROMPT_INJECTION = /\b(?:ignore|disregard|override)\b.{0,80}\b(?:previous|prior|system|instructions?)\b|\b(?:system prompt|developer message|jailbreak)\b/i;

export type PrivacyScanResult = { blocked: boolean; reasons: string[] };

export function scanCompletionPrivacy(input: Pick<CompletedWorkEventInput, "summary" | "sessionRef" | "projectRef" | "externalEventId" | "proof" | "privacy">): PrivacyScanResult {
  const material = [input.summary, input.sessionRef, input.projectRef, input.externalEventId, ...input.proof.flatMap((proof) => [proof.uri, proof.hash ?? ""])].join("\n");
  const reasons = [
    ...(input.privacy === "contains_secret" || input.privacy === "contains_pii" || input.privacy === "private_client" ? ["caller_privacy"] : []),
    ...(SECRET.test(material) ? ["secret"] : []),
    ...(PII.test(material) ? ["pii"] : []),
    ...(PRIVATE_PATH.test(material) ? ["private_path"] : []),
    ...(PROMPT_INJECTION.test(material) ? ["prompt_injection"] : []),
  ];
  return { blocked: reasons.length > 0, reasons };
}
