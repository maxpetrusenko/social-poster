import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supportTicketRateLimiter } from "@/lib/support/rate-limit";

const getSession = vi.fn();
const requireTenantContext = vi.fn();
const createSupportTicket = vi.fn();
const uploadLinearFileAsset = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@/lib/tenancy", () => ({ requireTenantContext }));
vi.mock("@/lib/support/tickets", () => ({
  createSupportTicket,
  uploadLinearFileAsset,
  normalizeSupportTicketSource: (value: unknown) =>
    ["from_user_triage", "from_bot", "from_github_issue", "from_me"].includes(
      String(value)
    )
      ? value
      : "from_user_triage",
}));

const session = {
  id: "session-1",
  email: "customer@example.com",
};

const tenant = {
  user: {
    id: "user-1",
    email: "customer@example.com",
    fullName: "Customer",
  },
  currentWorkspace: { id: "workspace-1", name: "Primary Workspace" },
  organization: { id: "org-1", name: "Customer Org" },
};

function request(body: Record<string, unknown>, headers?: HeadersInit) {
  return new NextRequest("https://smmagent.app/api/support-tickets", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("support ticket API", () => {
  beforeEach(() => {
    supportTicketRateLimiter.reset();
    getSession.mockResolvedValue(session);
    requireTenantContext.mockResolvedValue(tenant);
    createSupportTicket.mockResolvedValue({
      issue: {
        id: "linear-1",
        identifier: "MAX-101",
        title: "Support issue",
        url: "https://linear.app/example/issue/MAX-101",
      },
      attachment: { status: "skipped", reason: "No image was attached." },
      repairAgent: { status: "skipped", reason: "Auto repair was not requested." },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects anonymous submissions", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/support-tickets/route");

    const response = await POST(
      request({ topic: "Cannot connect", explanation: "Expected X to connect." })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  it.each([
    [{ topic: "", explanation: "Details" }, "Topic and explanation are required."],
    [
      { topic: "x".repeat(121), explanation: "Details" },
      "Topic must be 120 characters or fewer.",
    ],
    [
      { topic: "Issue", explanation: "x".repeat(5001) },
      "Explanation must be 5000 characters or fewer.",
    ],
    [
      { topic: "Issue", explanation: "Details", category: "internal_repair" },
      "Choose a valid support category.",
    ],
  ])("validates user input: %s", async (body, message) => {
    const { POST } = await import("@/app/api/support-tickets/route");

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  it("forces authenticated users into safe user triage without repair access", async () => {
    const { POST } = await import("@/app/api/support-tickets/route");

    const response = await POST(
      request({
        source: "from_bot",
        autoRepair: true,
        category: "account_access",
        topic: "Cannot connect Instagram",
        explanation: "Connect returns success but the account is missing.",
        pageUrl: "https://smmagent.app/dashboard/platforms",
        pageTitle: "Platforms",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual(
      expect.objectContaining({
        issue: expect.not.objectContaining({
          url: expect.anything(),
        }),
      })
    );
    expect(createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "from_user_triage",
        autoRepair: false,
        topic: "[Account access] Cannot connect Instagram",
        reporter: {
          email: "customer@example.com",
          name: "Customer",
          userId: "user-1",
        },
        workspace: {
          id: "workspace-1",
          name: "Primary Workspace",
          organizationName: "Customer Org",
        },
      })
    );
  });

  it("uploads an image and includes the stored asset in the user ticket", async () => {
    uploadLinearFileAsset.mockResolvedValue({
      url: "https://uploads.linear.app/support/screenshot.png",
    });
    const form = new FormData();
    form.set("category", "bug");
    form.set("topic", "Composer is blank");
    form.set("explanation", "The composer stays blank after selecting an account.");
    form.set(
      "image",
      new File(["image bytes"], "composer.png", { type: "image/png" })
    );
    const { POST } = await import("@/app/api/support-tickets/route");

    const response = await POST(
      new NextRequest("https://smmagent.app/api/support-tickets", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(200);
    expect(uploadLinearFileAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        filename: "composer.png",
      })
    );
    expect(createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: "composer.png",
        imageUrl: "https://uploads.linear.app/support/screenshot.png",
      })
    );
  });

  it("rate limits each authenticated user before uploads or Linear calls", async () => {
    const { POST } = await import("@/app/api/support-tickets/route");
    const body = { topic: "Composer is blank", explanation: "The composer did not load." };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(request(body));
      expect(response.status).toBe(200);
    }

    vi.clearAllMocks();
    getSession.mockResolvedValue(session);
    requireTenantContext.mockResolvedValue(tenant);
    const form = new FormData();
    form.set("topic", "Composer is still blank");
    form.set("explanation", "The composer did not recover.");
    form.set("image", new File(["image bytes"], "composer.png", { type: "image/png" }));
    const limited = await POST(
      new NextRequest("https://smmagent.app/api/support-tickets", {
        method: "POST",
        body: form,
      })
    );

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("600");
    await expect(limited.json()).resolves.toEqual({
      error: "Too many support requests. Try again later.",
    });
    expect(uploadLinearFileAsset).not.toHaveBeenCalled();
    expect(createSupportTicket).not.toHaveBeenCalled();

    requireTenantContext.mockResolvedValue({
      ...tenant,
      user: { ...tenant.user, id: "user-2", email: "other@example.com" },
    });
    createSupportTicket.mockResolvedValue({
      issue: {
        id: "linear-2",
        identifier: "MAX-102",
        title: "Support issue",
        url: "https://linear.app/example/issue/MAX-102",
      },
      attachment: { status: "skipped", reason: "No image was attached." },
      repairAgent: { status: "skipped", reason: "Auto repair was not requested." },
    });

    const isolated = await POST(request(body));
    expect(isolated.status).toBe(200);
    expect(createSupportTicket).toHaveBeenCalledOnce();
  });

  it("preserves trusted bot source and repair behavior", async () => {
    vi.stubEnv("SUPPORT_BOT_TOKEN", "trusted-support-token");
    getSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/support-tickets/route");

    const response = await POST(
      request(
        {
          source: "from_bot",
          autoRepair: true,
          topic: "Scheduler failed",
          explanation: "The registered schedule did not run.",
        },
        { "x-support-bot-token": "trusted-support-token" }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual(
      expect.objectContaining({
        issue: expect.objectContaining({
          url: "https://linear.app/example/issue/MAX-101",
        }),
      })
    );
    expect(createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "from_bot",
        autoRepair: true,
        topic: "Scheduler failed",
        reporter: { email: "bot", name: "Support bot" },
        workspace: null,
      })
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextResponse = await POST(
        request(
          {
            source: "from_bot",
            autoRepair: true,
            topic: `Scheduler failed ${attempt}`,
            explanation: "The registered schedule did not run.",
          },
          { "x-support-bot-token": "trusted-support-token" }
        )
      );
      expect(nextResponse.status).toBe(200);
    }
    expect(createSupportTicket).toHaveBeenCalledTimes(6);
  });

  it("returns a safe provider error without leaking integration details", async () => {
    createSupportTicket.mockRejectedValue(
      new Error("Linear request failed: 500 secret provider response")
    );
    const { POST } = await import("@/app/api/support-tickets/route");

    const response = await POST(
      request({ topic: "Cannot connect", explanation: "Expected X to connect." })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Support is temporarily unavailable. Try again in a moment.",
    });
  });
});
