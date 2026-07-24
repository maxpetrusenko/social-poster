import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let tempDir: string | null = null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("waitlist route fresh database", () => {
  it("stores a non-SMM brand signup in a newly initialized database", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-waitlist-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { POST } = await import("@/app/api/waitlist/route");
    const { sqlite } = await import("@/db");
    const response = await POST(
      new Request("https://clawposter.app/api/waitlist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "clawposter.app",
        },
        body: JSON.stringify({ email: "reader@example.com", source: "hero" }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(
      sqlite
        .prepare("SELECT email, source FROM waitlist_signups")
        .all()
    ).toEqual([
      { email: "reader@example.com", source: "clawposter.app:hero" },
    ]);

    sqlite.close();
  });
});
