import { createHash, randomUUID } from "crypto";

// Shared by POST /api/api-keys, key validation, and scripts/create-api-key.mjs
// (which mirrors this format; a test keeps them in lockstep).
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  const raw = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return `sk_${raw}`;
}
