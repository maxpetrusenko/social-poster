import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isBlogPublishAuthorized,
  validateExternalBlogPublishPayload,
} from "@/lib/blog/external-publish-contract";

function validPayload() {
  const links = Array.from(
    { length: 5 },
    (_, index) => `[source ${index + 1}](https://example.com/source-${index + 1})`,
  ).join(" ");
  const article = `# A Reviewed Hermes Article\n\n${links}\n\n${"evidence ".repeat(1550)}`;
  const articleSha256 = createHash("sha256").update(article).digest("hex");
  return {
    runId: "abc123def456",
    packageId: "2026-07-22-weekly-abc123def456",
    article,
    articleSha256,
    review: `article_sha256: "${articleSha256}"\noutcome: pass\n`,
  };
}

describe("external Hermes blog publishing", () => {
  it("accepts an exact-hash reviewed article with citations", () => {
    const result = validateExternalBlogPublishPayload(validPayload());

    expect(result.title).toBe("A Reviewed Hermes Article");
    expect(result.visibleWordCount).toBeGreaterThanOrEqual(1500);
    expect(result.visibleWordCount).toBeLessThanOrEqual(2000);
    expect(result.inlineUrls).toHaveLength(5);
  });

  it("counts link labels rather than URL path tokens as visible prose", () => {
    const result = validateExternalBlogPublishPayload(validPayload());

    expect(result.visibleWordCount).toBe(1564);
  });

  it("rejects an article whose supplied hash does not match", () => {
    expect(() =>
      validateExternalBlogPublishPayload({
        ...validPayload(),
        articleSha256: "0".repeat(64),
      }),
    ).toThrow(/SHA-256/i);
  });

  it("rejects a review that is not a pass", () => {
    const payload = validPayload();
    expect(() =>
      validateExternalBlogPublishPayload({
        ...payload,
        review: `article_sha256: "${payload.articleSha256}"\noutcome: revise\n`,
      }),
    ).toThrow(/review outcome/i);
  });

  it("rejects articles without five unique inline source links", () => {
    const payload = validPayload();
    const article = payload.article.replace(/\[source [3-5]\]\([^)]+\)/g, "source");
    const articleSha256 = createHash("sha256").update(article).digest("hex");
    expect(() =>
      validateExternalBlogPublishPayload({
        ...payload,
        article,
        articleSha256,
        review: `article_sha256: "${articleSha256}"\noutcome: pass\n`,
      }),
    ).toThrow(/inline source links/i);
  });

  it("requires an exact bearer token", () => {
    expect(isBlogPublishAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isBlogPublishAuthorized("Bearer wrong", "secret")).toBe(false);
    expect(isBlogPublishAuthorized(null, "secret")).toBe(false);
    expect(isBlogPublishAuthorized("Bearer secret", "")).toBe(false);
  });
});
