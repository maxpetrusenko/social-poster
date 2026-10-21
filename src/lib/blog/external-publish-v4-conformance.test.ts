// Shared v4 receiver conformance. Fixtures are byte copies of manager's
// scripts/tests/fixtures/v4-conformance (the Cloudflare Worker validator is canonical).
// Never edit them here: regenerate in manager and copy, then update MANIFEST.sha256.json.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateExternalBlogPublishPayload } from "./external-publish-contract";

const DIR = path.join(__dirname, "v4-conformance-fixtures");
const read = (name: string) => readFileSync(path.join(DIR, name), "utf8");
const cases: Array<{ name: string; file: string; expect: "accept" | "reject" }> =
  JSON.parse(read("cases.json"));
const manifest: Record<string, string> = JSON.parse(read("MANIFEST.sha256.json"));

describe("v4 conformance fixtures", () => {
  it("match MANIFEST.sha256.json", () => {
    expect(Object.keys(manifest).sort()).toEqual(
      [...cases.map((c) => c.file), "cases.json"].sort(),
    );
    for (const [file, sha] of Object.entries(manifest)) {
      expect(createHash("sha256").update(read(file)).digest("hex"), file).toBe(sha);
    }
  });
});

describe("social-poster v4 validator agrees with the Worker", () => {
  for (const c of cases) {
    it(`${c.name} -> ${c.expect}`, () => {
      const payload = JSON.parse(read(c.file));
      if (c.expect === "accept") {
        expect(() => validateExternalBlogPublishPayload(payload)).not.toThrow();
      } else {
        expect(() => validateExternalBlogPublishPayload(payload)).toThrow();
      }
    });
  }
});
