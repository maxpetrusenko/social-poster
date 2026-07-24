import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenant: { currentWorkspace: { id: "workspace-a" } },
  ingest: vi.fn(),
  dossier: vi.fn(),
  list: vi.fn(),
  timeline: vi.fn(),
  decision: vi.fn(),
  denial: vi.fn(),
}));

vi.mock("@/lib/work-to-post/api-auth", () => ({ requireWorkToPostEditor: vi.fn(async () => state.tenant), requireConfiguredWorkToPostApprover: vi.fn(async () => state.tenant) }));
vi.mock("@/lib/work-to-post/ingestion", () => ({ ingestCompletedWork: state.ingest }));
vi.mock("@/lib/work-to-post/dossier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-to-post/dossier")>()),
  createPersonDossier: state.dossier,
}));
vi.mock("@/lib/work-to-post/lifecycle", () => ({ recordDecision: state.decision }));
vi.mock("@/lib/work-to-post/learning-repository", () => ({
  createLearningProposalFromDenial: state.denial,
  WorkToPostConflictError: class WorkToPostConflictError extends Error {},
  WorkToPostNotFoundError: class WorkToPostNotFoundError extends Error {},
}));
vi.mock("@/lib/work-to-post/sqlite-repository", () => ({
  createSqliteWorkToPostRepository: vi.fn(() => ({})),
  listCandidates: state.list,
  getCandidateTimeline: state.timeline,
  getPersonDossier: vi.fn(),
}));

describe("work-to-post core routes", () => {
  it("sanitizes completion intake before the service boundary and never logs malformed raw JSON", async () => {
    state.ingest.mockResolvedValue({ status: "eligible", completionEventId: "event-1", candidateId: "candidate-1", replayed: false });
    const { POST } = await import("@/app/api/work-to-post/events/route");
    const response = await POST(new Request("http://test/api/work-to-post/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceAgent: "codex", externalEventId: "event-1", sessionRef: "session-1", projectRef: "social-poster", summary: "safe summary", occurredAt: "2026-07-24T12:00:00.000Z", privacy: "public_safe", proof: [{ type: "test", uri: "https://github.com/maxpetrusenko/social-poster/actions/runs/1" }], transcript: "do not persist" }) }));
    expect(response.status).toBe(201);
    expect(state.ingest.mock.calls[0]?.[2]).not.toHaveProperty("transcript");
    const rejected = await POST(new Request("http://test/api/work-to-post/events", { method: "POST", body: "not json" }));
    expect(rejected.status).toBe(400);
    expect(state.ingest).toHaveBeenCalledTimes(1);
  });

  it("creates dossiers only from public-professional source URLs", async () => {
    state.dossier.mockResolvedValue({ id: "dossier-1", status: "clear", version: 1 });
    const { POST } = await import("@/app/api/work-to-post/people/dossiers/route");
    const response = await POST(new Request("http://test/api/work-to-post/people/dossiers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canonicalIdentityKey: "linkedin:person", displayName: "Person", sources: [{ url: "https://linkedin.com/in/person", kind: "primary_profile", capturedAt: "2026-07-24T12:00:00.000Z" }, { url: "https://person.example/posts", kind: "first_party_activity", capturedAt: "2026-07-24T12:00:00.000Z" }], claims: [{ statement: "ships tools", sourceUrls: ["https://person.example/posts"] }] }) }));
    expect(response.status).toBe(201);
    expect(state.dossier.mock.calls[0]?.[1]).toBe("workspace-a");
    const rejected = await POST(new Request("http://test/api/work-to-post/people/dossiers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canonicalIdentityKey: "bad", displayName: "Bad", sources: [{ url: "https://token@example.com", kind: "primary_profile", capturedAt: "2026-07-24T12:00:00.000Z" }], claims: [] }) }));
    expect(rejected.status).toBe(400);
  });

  it("uses the authenticated workspace for candidate reads", async () => {
    state.list.mockResolvedValue([{ id: "candidate-a", workspaceId: "workspace-a" }]);
    state.timeline.mockResolvedValue({ candidate: { id: "candidate-a" }, timeline: [] });
    const { GET: list } = await import("@/app/api/work-to-post/candidates/route");
    const { GET: timeline } = await import("@/app/api/work-to-post/candidates/[id]/timeline/route");
    expect((await list()).status).toBe(200);
    expect(state.list).toHaveBeenCalledWith("workspace-a");
    expect((await timeline(new Request("http://test"), { params: Promise.resolve({ id: "candidate-a" }) })).status).toBe(200);
    expect(state.timeline).toHaveBeenCalledWith("workspace-a", "candidate-a");
  });

  it("accepts only minimal, hash-free decisions with a revision precondition", async () => {
    state.decision.mockResolvedValue({ replayed: false, dispatch: { mode: "local_fake", action: "simulated_scheduled", dispatchId: "dispatch-1" } });
    const { POST } = await import("@/app/api/work-to-post/candidates/[id]/decisions/route");
    const response = await POST(new Request("http://test", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "key-1", "if-match-revision": "1" }, body: JSON.stringify({ type: "approve_schedule", scheduledAt: "2026-07-25T12:00:00.000Z", contentHash: "caller-value-is-ignored" }) }), { params: Promise.resolve({ id: "candidate-a" }) });
    expect(response.status).toBe(200);
    expect(state.decision.mock.calls[0]?.[2]).toBe("candidate-a");
    expect(state.decision.mock.calls[0]?.[3]).toEqual({ type: "approve_schedule", scheduledAt: "2026-07-25T12:00:00.000Z" });
    const invalid = await POST(new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "approve_now" }) }), { params: Promise.resolve({ id: "candidate-a" }) });
    expect(invalid.status).toBe(400);
  });

  it("routes denial through the atomic rejected-candidate learning mutation", async () => {
    state.denial.mockResolvedValue({ replayed: false, candidate: { id: "candidate-a", status: "rejected", currentRevision: 1 }, proposal: { id: "proposal-a" } });
    const { POST } = await import("@/app/api/work-to-post/candidates/[id]/decisions/route");
    const response = await POST(new Request("http://test", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "deny-1", "if-match-revision": "1" }, body: JSON.stringify({ type: "deny", reasonCodes: ["too_generic"] }) }), { params: Promise.resolve({ id: "candidate-a" }) });
    expect(response.status).toBe(201);
    expect(state.denial).toHaveBeenCalledWith({ workspaceId: "workspace-a", candidateId: "candidate-a", expectedRevision: 1, idempotencyKey: "deny-1", reasonCodes: ["too_generic"] });
    expect(state.decision).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ type: "deny" }), expect.anything());
  });
});
