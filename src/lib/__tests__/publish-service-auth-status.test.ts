import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishViaNativeProvider: vi.fn(),
  shouldPublishViaNativeProvider: vi.fn(),
  publishToLate: vi.fn(),
  markFailure: vi.fn(),
  clearFailure: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/providers/native-publisher", () => ({
  publishViaNativeProvider: mocks.publishViaNativeProvider,
  shouldPublishViaNativeProvider: mocks.shouldPublishViaNativeProvider,
}));
vi.mock("@/lib/pipeline/publisher", () => ({ publishToLate: mocks.publishToLate }));
vi.mock("@/lib/pipeline/bird-publisher", () => ({ publishToBird: vi.fn() }));
vi.mock("@/lib/platform-capabilities", () => ({
  getPlatformCapabilities: () => ({}),
  getCapabilityFailureReason: () => null,
}));
vi.mock("@/lib/platform-auth-status", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform-auth-status")>(
    "@/lib/platform-auth-status"
  );
  return {
    ...actual,
    clearPlatformAuthFailure: mocks.clearFailure,
    markPlatformAuthFailure: mocks.markFailure,
    recordAuthFailureFromError: vi.fn(async (id: string, input) => {
      const { resolveAuthFailureStatus } = await import("@/lib/platform-connection-state");
      const status = resolveAuthFailureStatus(input);
      if (status) mocks.markFailure(id, status, input.message);
      return status;
    }),
  };
});

import { publishPlatformTargets } from "@/lib/pipeline/publish-service";

type Platform = Parameters<typeof publishPlatformTargets>[0][number]["platform"];

function platform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: "plat-1",
    workspaceId: "w1",
    name: "IG",
    type: "instagram",
    handle: "max",
    accountId: "acc",
    provider: "direct",
    config: {},
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Platform;
}

describe("publish service connection status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shouldPublishViaNativeProvider.mockReturnValue(true);
  });

  it("marks token_expired when a Graph 190 comes back as a 400", async () => {
    mocks.publishViaNativeProvider.mockResolvedValue({
      platform: "instagram",
      provider: "direct",
      accountId: "acc",
      success: false,
      classification: "validation_error",
      error: "Instagram API error 400",
      raw: { error: { code: 190, message: "Error validating access token" } },
    });
    await publishPlatformTargets([{ platform: platform(), content: "hi" }]);
    expect(mocks.markFailure).toHaveBeenCalledWith("plat-1", "token_expired", "Instagram API error 400");
  });

  it("marks disconnected when Zernio reports a disconnected account", async () => {
    mocks.shouldPublishViaNativeProvider.mockReturnValue(false);
    mocks.publishToLate.mockResolvedValue([
      {
        platform: "instagram",
        provider: "late",
        accountId: "acc",
        success: false,
        classification: "provider_error",
        error: "Account disconnected. Reconnect the account.",
      },
    ]);
    await publishPlatformTargets([{ platform: platform({ provider: "zernio" }), content: "hi" }]);
    expect(mocks.markFailure).toHaveBeenCalledWith(
      "plat-1",
      "disconnected",
      "Account disconnected. Reconnect the account."
    );
  });

  it("does not flag a healthy X account on a duplicate or permission 403", async () => {
    for (const detail of [
      "You are not allowed to create a Tweet with duplicate content.",
      "You are not permitted to perform this action.",
    ]) {
      mocks.publishViaNativeProvider.mockResolvedValueOnce({
        platform: "twitter",
        provider: "direct",
        accountId: "acc",
        success: false,
        classification: "auth_error",
        error: `X API error 403: {"detail":"${detail}","status":403}`,
        raw: { detail, status: 403 },
      });
      await publishPlatformTargets([{ platform: platform(), content: "hi" }]);
    }
    expect(mocks.markFailure).not.toHaveBeenCalled();
  });

  it("does not flag on a network drop", async () => {
    mocks.publishViaNativeProvider.mockResolvedValueOnce({
      platform: "instagram",
      provider: "direct",
      accountId: "acc",
      success: false,
      classification: "network_error",
      error: "Client network socket disconnected before secure TLS connection was established",
    });
    await publishPlatformTargets([{ platform: platform(), content: "hi" }]);
    expect(mocks.markFailure).not.toHaveBeenCalled();
  });

  it("does not mark unrelated failures, and clears a stale flag on success", async () => {
    mocks.publishViaNativeProvider.mockResolvedValueOnce({
      platform: "instagram",
      provider: "direct",
      accountId: "acc",
      success: false,
      classification: "validation_error",
      error: "Caption too long",
    });
    await publishPlatformTargets([{ platform: platform(), content: "hi" }]);
    expect(mocks.markFailure).not.toHaveBeenCalled();

    mocks.publishViaNativeProvider.mockResolvedValueOnce({
      platform: "instagram",
      provider: "direct",
      accountId: "acc",
      success: true,
      classification: "success",
    });
    await publishPlatformTargets([
      {
        platform: platform({
          config: { connectionIssue: { status: "token_expired", reason: "x", at: "t" } },
        }),
        content: "hi",
      },
    ]);
    expect(mocks.clearFailure).toHaveBeenCalledWith("plat-1");
  });
});
