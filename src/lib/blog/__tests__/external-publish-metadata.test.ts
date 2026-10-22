import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const inserted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
      },
    }),
  },
}));

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "../v4-conformance-fixtures/valid.json"), "utf8"),
);

beforeEach(() => {
  inserted.length = 0;
});

describe("v4 publish writes publicationDate to row metadata", () => {
  it("stores the payload publicationDate in the post metadata", async () => {
    const { publishExternalBlogArticle } = await import("../external-publish");
    await publishExternalBlogArticle(fixture);
    const post = inserted.find((row) => row.externalDraftPath);
    expect(fixture.publicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((post?.metadata as Record<string, unknown>).publicationDate).toBe(
      fixture.publicationDate,
    );
  });
});
