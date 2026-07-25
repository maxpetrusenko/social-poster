import { describe, expect, it } from "vitest";

import { createInMemoryWorkToPostRepository } from "@/lib/work-to-post/repository";
import { ingestCompletedWork } from "@/lib/work-to-post/ingestion";
import { createPersonDossier } from "@/lib/work-to-post/dossier";
import { recordDecision } from "@/lib/work-to-post/lifecycle";

const fixtureResolver = { verify: async (proof: { uri: string }) => proof.uri.includes("github.com/maxpetrusenko/social-poster") };
const dossierResolver = { verify: async () => true };

const completedWork = {
  sourceAgent: "codex" as const,
  externalEventId: "session-42:complete",
  sessionRef: "codex:session-42",
  projectRef: "social-poster",
  summary: "Added a safe local work-to-post intake boundary.",
  occurredAt: "2026-07-24T12:00:00.000Z",
  privacy: "public_safe" as const,
  proof: [{ type: "test" as const, uri: "https://github.com/maxpetrusenko/social-poster/actions/runs/42", verifiedAt: "2026-07-24T12:01:00.000Z" }],
  transcript: "this raw transcript must never cross the boundary",
};
const futureTimestamp = (offsetMs = 60 * 60 * 1000) => new Date(Date.now() + offsetMs).toISOString();

describe("work-to-post core walking skeleton", () => {
  it("replays a completion event without creating a second candidate or storing a transcript", async () => {
    const repository = createInMemoryWorkToPostRepository();

    const first = await ingestCompletedWork(repository, "workspace-a", completedWork, fixtureResolver);
    const replay = await ingestCompletedWork(repository, "workspace-a", completedWork, fixtureResolver);

    expect(first).toMatchObject({ status: "eligible", replayed: false });
    expect(replay).toMatchObject({ status: "eligible", replayed: true, candidateId: first.candidateId });
    expect(await repository.count("completionEvents")).toBe(1);
    expect(await repository.count("candidates")).toBe(1);
    expect(await repository.serializedState()).not.toContain("raw transcript");
  });

  it("fails closed for secret/private work and records a trace-safe lifecycle", async () => {
    const repository = createInMemoryWorkToPostRepository();

    const result = await ingestCompletedWork(repository, "workspace-a", {
      ...completedWork,
      externalEventId: "secret-session",
      privacy: "contains_secret",
      proof: [],
    });

    expect(result).toMatchObject({ status: "blocked_privacy", candidateId: null });
    expect(await repository.count("candidates")).toBe(0);
    expect(await repository.serializedState()).not.toContain("transcript");
    expect(await repository.serializedState()).not.toContain("Added a safe");
  });

  it("hashes session references and treats caller verification metadata as non-authoritative", async () => {
    const repository = createInMemoryWorkToPostRepository();
    const result = await ingestCompletedWork(repository, "workspace-a", {
      ...completedWork,
      externalEventId: "untrusted-proof",
      sessionRef: "/Users/max/private-session",
      proof: [{ type: "artifact", uri: "https://example.com/verified", verifiedAt: "2026-07-24T12:01:00.000Z" }],
    });
    expect(result.status).toBe("blocked_privacy");
    const state = await repository.serializedState();
    expect(state).not.toContain("/Users/max/private-session");
    expect(state).not.toContain("untrusted-proof");
  });

  it("accepts enabled thread adapters and rejects unsafe proof URIs before they can become eligible", async () => {
    const repository = createInMemoryWorkToPostRepository();
    const cursor = await ingestCompletedWork(repository, "workspace-a", { ...completedWork, sourceAgent: "cursor", externalEventId: "cursor-session" }, fixtureResolver);
    const hermes = await ingestCompletedWork(repository, "workspace-a", { ...completedWork, sourceAgent: "hermes", externalEventId: "hermes-session" }, fixtureResolver);
    expect(cursor.status).toBe("eligible");
    expect(hermes.status).toBe("eligible");
    const unsafe = await ingestCompletedWork(repository, "workspace-a", { ...completedWork, externalEventId: "unsafe", proof: [{ type: "artifact", uri: "https://token@example.com/private/log?token=secret" }] });
    expect(unsafe.status).toBe("blocked_privacy");
  });

  it("blocks stale or ambiguous dossiers and accepts cited public-professional evidence", async () => {
    const repository = createInMemoryWorkToPostRepository();
    const valid = await createPersonDossier(repository, "workspace-a", {
      canonicalIdentityKey: "linkedin:person-a",
      displayName: "Person A",
      sources: [
        { url: "https://linkedin.com/in/person-a", kind: "primary_profile", capturedAt: "2026-07-24T12:00:00.000Z" },
        { url: "https://person-a.dev/posts/shipping", kind: "first_party_activity", capturedAt: "2026-07-23T12:00:00.000Z" },
      ],
      claims: [{ statement: "Person A ships developer tools.", sourceUrls: ["https://person-a.dev/posts/shipping"] }],
    }, dossierResolver);
    const stale = await createPersonDossier(repository, "workspace-a", {
      canonicalIdentityKey: "linkedin:person-b",
      displayName: "Person B",
      sources: [
        { url: "https://linkedin.com/in/person-b", kind: "primary_profile", capturedAt: "2025-01-01T12:00:00.000Z" },
        { url: "https://person-b.dev", kind: "first_party_activity", capturedAt: "2025-01-01T12:00:00.000Z" },
      ],
      claims: [{ statement: "Person B builds tools.", sourceUrls: ["https://person-b.dev"] }],
    }, dossierResolver);

    expect(valid.status).toBe("clear");
    expect(valid.claims[0]?.sourceUrls).toEqual(["https://person-a.dev/posts/shipping"]);
    expect(stale.status).toBe("blocked_stale");
  });

  it("records exact schedule intent once through a local-only boundary", async () => {
    const repository = createInMemoryWorkToPostRepository();
    const intake = await ingestCompletedWork(repository, "workspace-a", completedWork, fixtureResolver);
    if (!intake.candidateId) throw new Error("expected candidate");

    const input = {
      type: "approve_schedule" as const,
      scheduledAt: futureTimestamp(),
    };
    const first = await recordDecision(repository, "workspace-a", intake.candidateId, input, {
      idempotencyKey: "schedule-1",
      expectedRevision: 1,
    });
    const replay = await recordDecision(repository, "workspace-a", intake.candidateId, input, {
      idempotencyKey: "schedule-1",
      expectedRevision: 1,
    });

    expect(first.dispatch).toMatchObject({ mode: "local_fake", action: "simulated_scheduled" });
    expect(replay.replayed).toBe(true);
    expect(await repository.count("dispatches")).toBe(1);
    expect(await repository.serializedState()).not.toContain("bird");
  });

  it("replays a completed immutable receipt before reading mutable candidate state", async () => {
    const base = createInMemoryWorkToPostRepository();
    const intake = await ingestCompletedWork(base, "workspace-a", completedWork, fixtureResolver);
    if (!intake.candidateId) throw new Error("expected candidate");
    let mutableReadsAllowed = true;
    const repository = {
      ...base,
      async getCandidate(workspaceId: string, candidateId: string) {
        if (!mutableReadsAllowed) throw new Error("mutable state should not be read for a replay");
        return base.getCandidate(workspaceId, candidateId);
      },
    };
    const command = { type: "approve_now" as const };
    await recordDecision(repository, "workspace-a", intake.candidateId, command, {
      idempotencyKey: "immutable-replay",
      expectedRevision: 1,
    });
    mutableReadsAllowed = false;
    const replay = await recordDecision(repository, "workspace-a", intake.candidateId, command, {
      idempotencyKey: "immutable-replay",
      expectedRevision: 1,
    });
    expect(replay.replayed).toBe(true);
  });

  it("releases a failed claim so the same immutable request can retry", async () => {
    const repository = createInMemoryWorkToPostRepository();
    const intake = await ingestCompletedWork(repository, "workspace-a", completedWork, fixtureResolver);
    if (!intake.candidateId) throw new Error("expected candidate");
    let attempts = 0;
    const adapter = {
      async dispatch() {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary adapter failure");
        return { dispatchId: "dispatch-after-retry", action: "simulated_published" as const };
      },
    };
    const options = { idempotencyKey: "retryable-claim", expectedRevision: 1 };
    await expect(recordDecision(repository, "workspace-a", intake.candidateId, { type: "approve_now" }, options, adapter)).rejects.toThrow("temporary adapter failure");
    const retry = await recordDecision(repository, "workspace-a", intake.candidateId, { type: "approve_now" }, options, adapter);
    expect(retry.dispatch.dispatchId).toBe("dispatch-after-retry");
    expect(attempts).toBe(2);
  });

  it("preserves a completed receipt when lifecycle logging fails after dispatch", async () => {
    const base = createInMemoryWorkToPostRepository();
    const intake = await ingestCompletedWork(base, "workspace-a", completedWork, fixtureResolver);
    if (!intake.candidateId) throw new Error("expected candidate");
    let dispatches = 0;
    const adapter = {
      async dispatch() {
        dispatches += 1;
        return { dispatchId: "dispatch-before-lifecycle-failure", action: "simulated_published" as const };
      },
    };
    const repository = {
      ...base,
      async appendLifecycle() {
        throw new Error("lifecycle sink unavailable");
      },
    };
    const command = { type: "approve_now" as const };
    const options = { idempotencyKey: "completed-before-lifecycle", expectedRevision: 1 };

    await expect(recordDecision(repository, "workspace-a", intake.candidateId, command, options, adapter)).rejects.toThrow("lifecycle sink unavailable");
    const replay = await recordDecision(repository, "workspace-a", intake.candidateId, command, options, adapter);

    expect(replay).toMatchObject({ replayed: true, dispatch: { dispatchId: "dispatch-before-lifecycle-failure" } });
    expect(dispatches).toBe(1);
  });

  it("rejects a same-key command with a different payload", async () => {
    const repository = createInMemoryWorkToPostRepository();
    const intake = await ingestCompletedWork(repository, "workspace-a", completedWork, fixtureResolver);
    if (!intake.candidateId) throw new Error("expected candidate");
    await recordDecision(repository, "workspace-a", intake.candidateId, { type: "approve_schedule", scheduledAt: futureTimestamp() }, { idempotencyKey: "same-key", expectedRevision: 1 });
    await expect(recordDecision(repository, "workspace-a", intake.candidateId, { type: "approve_schedule", scheduledAt: futureTimestamp(2 * 60 * 60 * 1000) }, { idempotencyKey: "same-key", expectedRevision: 1 })).rejects.toThrow("different request");
  });
});
