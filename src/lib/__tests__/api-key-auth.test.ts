import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

describe("api-key-auth hashing", () => {
  function hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  it("produces consistent hashes", () => {
    const key = "sk_test123";
    expect(hashKey(key)).toBe(hashKey(key));
  });

  it("different keys produce different hashes", () => {
    expect(hashKey("sk_key1")).not.toBe(hashKey("sk_key2"));
  });

  it("produces 64-char hex string", () => {
    const hash = hashKey("sk_test");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
