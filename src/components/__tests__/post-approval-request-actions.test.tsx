import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { PostApprovalRequestActions } from "@/components/post-approval-request-actions";
import { PostApprovalRequestButton } from "@/components/post-approval-request-button";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("approval request controls", () => {
  it("shows the decision buttons and posts the selected decision", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PostApprovalRequestActions, { postId: "post-1" }));

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/posts/post-1/approval-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      });
      expect(router.refresh).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });

  it("posts a request approval action from the card button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PostApprovalRequestButton, { postId: "post-1" }));

    fireEvent.click(screen.getByRole("button", { name: /request approval/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/posts/post-1/approval-request", {
        method: "POST",
      });
      expect(router.refresh).toHaveBeenCalled();
    });
  });
});
