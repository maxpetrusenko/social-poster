import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPersonDossier } from "@/lib/work-to-post/dossier";
import { ingestCompletedWork } from "@/lib/work-to-post/ingestion";

vi.mock("server-only", () => ({}));

let tempDir: string | null = null;
afterEach(async () => {
  const dbModule = await import("@/db").catch(() => null);
  dbModule?.sqlite.close();
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("SQLite work-to-post repository", () => {
  it("persists a sanitized candidate and cited dossier in a fresh database", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-work-to-post-repository-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    const repositoryModule = await import("@/lib/work-to-post/sqlite-repository");
    const repository = repositoryModule.createSqliteWorkToPostRepository();
    const intake = await ingestCompletedWork(repository, "workspace-a", {
      sourceAgent: "codex", externalEventId: "session-1", sessionRef: "local/session-1", projectRef: "social-poster", summary: "Finished a public-safe proof boundary.", occurredAt: "2026-07-24T12:00:00.000Z", privacy: "public_safe", proof: [{ type: "test", uri: "https://github.com/maxpetrusenko/social-poster/actions/runs/1" }],
    }, { verify: async () => true });
    expect(intake.status).toBe("eligible");
    expect((await repositoryModule.listCandidates("workspace-a")).length).toBe(1);
    if (!intake.candidateId) throw new Error("expected candidate");
    expect((await repository.getDispatchScope("workspace-a", intake.candidateId, 1))?.reviewStatus).toBeNull();
    expect((await repositoryModule.getCandidateTimeline("workspace-a", intake.candidateId))?.release.allowed).toBe(false);
    await repositoryModule.recordContentReview("workspace-a", intake.candidateId, 1, "pass");
    expect((await repository.getDispatchScope("workspace-a", intake.candidateId, 1))?.reviewStatus).toBe("pass");
    expect((await repositoryModule.getCandidateTimeline("workspace-a", intake.candidateId))?.release.allowed).toBe(true);
    const dossier = await createPersonDossier(repository, "workspace-a", {
      canonicalIdentityKey: "linkedin:person-a", displayName: "Person A",
      sources: [{ url: "https://linkedin.com/in/person-a", kind: "primary_profile", capturedAt: "2026-07-24T12:00:00.000Z" }, { url: "https://person-a.example/posts", kind: "first_party_activity", capturedAt: "2026-07-24T12:00:00.000Z" }],
      claims: [{ statement: "Person A ships developer tools.", sourceUrls: ["https://person-a.example/posts"] }],
    }, { verify: async () => true });
    const persisted = await repositoryModule.getPersonDossier("workspace-a", dossier.id);
    expect(persisted?.status).toBe("clear");
    expect(persisted?.sources).toHaveLength(2);
    expect(persisted?.claims[0]?.sourceUrls).toEqual(["https://person-a.example/posts"]);
  });
});
