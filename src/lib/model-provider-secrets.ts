import "server-only";

import crypto from "node:crypto";

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted secret");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string) {
  const clean = value.trim();
  return {
    prefix: clean.slice(0, 8),
    suffix: clean.slice(-4),
  };
}

function secretKey() {
  const secret =
    process.env.MODEL_CREDENTIAL_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-model-credential-secret";
  return crypto.createHash("sha256").update(secret).digest();
}
