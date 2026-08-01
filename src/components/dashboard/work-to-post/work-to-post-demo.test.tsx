import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkToPostAnalytics } from "./work-to-post-analytics";
import { WorkToPostReviewBoard } from "./work-to-post-review-board";

describe("work-to-post fixture demo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses Live workspace as the default review surface", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    render(<WorkToPostReviewBoard />);

    expect(screen.getByRole("button", { name: "Live workspace" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Live workspace data is session-authenticated/i)).toBeTruthy();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/work-to-post/candidates", undefined));
  });

  it("loads a live workspace and only maps a server-confirmed comment revision", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/work-to-post/candidates") return new Response(JSON.stringify({ candidates: [{ id: "candidate-live", status: "eligible", currentRevision: 2, createdAt: "2026-07-24T12:00:00.000Z" }] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/timeline") return new Response(JSON.stringify({ candidate: { id: "candidate-live", status: "eligible", currentRevision: 2 }, timeline: [], angles: [], comments: [], revisions: [] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/comments") {
        expect(init?.headers).toEqual(expect.objectContaining({ "Idempotency-Key": expect.any(String), "If-Match-Revision": "2" }));
        return new Response(JSON.stringify({ revision: 3, approvalInvalidated: true }), { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<WorkToPostReviewBoard />);

    await screen.findAllByText("candidate-live");
    await screen.findByText(/Live workspace data is session-authenticated/i);
    fireEvent.change(screen.getByLabelText("Add review comment"), { target: { value: "Tighten the proof line." } });
    fireEvent.click(screen.getByRole("button", { name: "Add comment and revise" }));

    await waitFor(() => expect(screen.getByText(/Server-confirmed revision: 3/i)).toBeTruthy());
    expect(fetchSpy).toHaveBeenCalledWith("/api/work-to-post/candidates/candidate-live/comments", expect.objectContaining({ method: "POST" }));
  });

  it("keeps live state unchanged and surfaces a stale revision blocker", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/work-to-post/candidates") return new Response(JSON.stringify({ candidates: [{ id: "candidate-live", status: "eligible", currentRevision: 2, createdAt: "2026-07-24T12:00:00.000Z" }] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/timeline") return new Response(JSON.stringify({ candidate: { id: "candidate-live", status: "eligible", currentRevision: 2 }, timeline: [], angles: [], comments: [], revisions: [] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/comments") return new Response(JSON.stringify({ error: "Candidate revision is stale." }), { status: 409 });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<WorkToPostReviewBoard />);

    await screen.findAllByText("candidate-live");
    fireEvent.change(screen.getByLabelText("Add review comment"), { target: { value: "Tighten the proof line." } });
    fireEvent.click(screen.getByRole("button", { name: "Add comment and revise" }));

    await screen.findByRole("alert", { name: /Candidate revision is stale/i });
    expect(screen.getByText(/Server-confirmed revision: 2/i)).toBeTruthy();
  });

  it("enables an exact reviewed live revision and maps only the server-confirmed post-now result", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/work-to-post/candidates") return new Response(JSON.stringify({ candidates: [{ id: "candidate-live", status: "eligible", currentRevision: 2 }] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/timeline") return new Response(JSON.stringify({
        candidate: { id: "candidate-live", status: "eligible", currentRevision: 2 },
        timeline: [], angles: [], comments: [], revisions: [],
        release: { allowed: true, reason: null, account: "max-x", policyVersion: "v1", approvalExpiresAt: "2099-01-01T00:00:00.000Z", reviewStatus: "pass" },
      }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/decisions") {
        return new Response(JSON.stringify({
          replayed: false,
          dispatch: { mode: "local_fake", action: "simulated_published", dispatchId: "dispatch-1" },
          candidate: { id: "candidate-live", status: "published", currentRevision: 2 },
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<WorkToPostReviewBoard />);

    await screen.findAllByText("candidate-live");
    await waitFor(() => expect(screen.getByRole("button", { name: "Post now" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Post now" }));

    await screen.findByText("simulated_published");
    expect(screen.getByText(/Status: published/i)).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith("/api/work-to-post/candidates/candidate-live/decisions", expect.objectContaining({ method: "POST" }));
    const decisionCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/decisions"));
    expect(decisionCall?.[1]?.headers).toEqual(expect.objectContaining({ "Idempotency-Key": expect.any(String), "If-Match-Revision": "2" }));
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toEqual({ type: "approve_now" });
  });

  it("shows the exact scheduled timestamp and timezone, then submits that unchanged value", async () => {
    const exactTimestamp = "2099-01-02T09:30:00+02:00";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/work-to-post/candidates") return new Response(JSON.stringify({ candidates: [{ id: "candidate-live", status: "eligible", currentRevision: 2 }] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/timeline") return new Response(JSON.stringify({ candidate: { id: "candidate-live", status: "eligible", currentRevision: 2 }, timeline: [], angles: [], comments: [], revisions: [], release: { allowed: true, reason: null, account: "max-x", policyVersion: "v1", approvalExpiresAt: "2099-01-01T00:00:00.000Z", reviewStatus: "pass" } }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/decisions") return new Response(JSON.stringify({
        replayed: false,
        dispatch: { mode: "local_fake", action: "simulated_scheduled", dispatchId: "dispatch-schedule" },
        candidate: { id: "candidate-live", status: "scheduled", currentRevision: 2 },
      }), { status: 201 });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<WorkToPostReviewBoard />);

    await screen.findAllByText("candidate-live");
    const input = screen.getByLabelText("Schedule timestamp");
    fireEvent.change(input, { target: { value: exactTimestamp } });
    expect(input).toHaveProperty("value", exactTimestamp);
    expect(screen.getByText("Timezone: UTC+02:00. This exact value is submitted unchanged.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Schedule" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    await screen.findByText("simulated_scheduled");
    expect(screen.getByText(/Status: scheduled/i)).toBeTruthy();
    const decisionCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/decisions"));
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toEqual({ type: "approve_schedule", scheduledAt: exactTimestamp });
  });

  it("maps denial only after the server confirms rejection and release invalidation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/work-to-post/candidates") return new Response(JSON.stringify({ candidates: [{ id: "candidate-live", status: "eligible", currentRevision: 2 }] }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/timeline") return new Response(JSON.stringify({ candidate: { id: "candidate-live", status: "eligible", currentRevision: 2 }, timeline: [], angles: [], comments: [], revisions: [], release: { allowed: true, reason: null, account: "max-x", policyVersion: "v1", approvalExpiresAt: "2099-01-01T00:00:00.000Z", reviewStatus: "pass" } }), { status: 200 });
      if (url === "/api/work-to-post/candidates/candidate-live/feedback") return new Response(JSON.stringify({ replayed: false, candidate: { id: "candidate-live", status: "rejected", currentRevision: 2 }, proposal: { id: "proposal-a" } }), { status: 201 });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<WorkToPostReviewBoard />);

    await screen.findAllByText("candidate-live");
    await waitFor(() => expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));

    await screen.findByText(/Status: rejected/i);
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Post now" })).toHaveProperty("disabled", true);
  });

  it("surfaces a live workspace access blocker without falling back to fixture data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Workspace access is required." }), { status: 403 }));
    render(<WorkToPostReviewBoard />);

    await screen.findByRole("alert", { name: /Workspace access is required/i });
    expect(screen.queryByText("Artifact proof changed the release conversation")).toBeNull();
  });

  it("keeps decisions local and invalidates approval when a comment creates a revision", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    render(<WorkToPostReviewBoard />);
    fireEvent.click(screen.getByRole("button", { name: "Fixture demo" }));

    expect(screen.getByRole("heading", { name: "Review" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Scheduled" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Published" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /artifact proof/i }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(within(screen.getByRole("dialog")).getByText("simulated_scheduled")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Add review comment"), {
      target: { value: "Tighten the proof line." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    expect(screen.getByText("Revision 4")).toBeTruthy();
    expect(screen.getByText("Approval invalidated by comment")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByText("simulated_scheduled")).toBeNull();
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Post now" })).toHaveProperty("disabled", true);
  });

  it("labels analytics correlation and missing metrics as fixture limits", () => {
    render(<WorkToPostAnalytics />);

    expect(screen.getByText(/Correlation, not causation/i)).toBeTruthy();
    expect(screen.getByText(/Missing metrics/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Trace explorer/i })).toBeTruthy();
  });
});
