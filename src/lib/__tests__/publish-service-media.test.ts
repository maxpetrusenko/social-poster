import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishViaNativeProvider: vi.fn(),
  shouldPublishViaNativeProvider: vi.fn(),
  publishToLate: vi.fn(),
  publishToBird: vi.fn(),
  getPlatformCapabilities: vi.fn(),
  getCapabilityFailureReason: vi.fn(),
  dbRows: [] as unknown[],
  dbSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.dbSelect,
  },
}));

vi.mock("@/lib/providers/native-publisher", () => ({
  publishViaNativeProvider: mocks.publishViaNativeProvider,
  shouldPublishViaNativeProvider: mocks.shouldPublishViaNativeProvider,
}));

vi.mock("@/lib/pipeline/publisher", () => ({
  publishToLate: mocks.publishToLate,
}));

vi.mock("@/lib/pipeline/bird-publisher", () => ({
  publishToBird: mocks.publishToBird,
}));

vi.mock("@/lib/platform-capabilities", () => ({
  getPlatformCapabilities: mocks.getPlatformCapabilities,
  getCapabilityFailureReason: mocks.getCapabilityFailureReason,
}));

import { publishPlatformTargets } from "@/lib/pipeline/publish-service";

type TestPlatform = Parameters<typeof publishPlatformTargets>[0][number]["platform"];

describe("publish service media routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbRows = [];
    mocks.dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve(mocks.dbRows),
      }),
    }));
    mocks.getPlatformCapabilities.mockReturnValue({
      canPublishText: true,
      canPublishImage: true,
      canPublishVideo: true,
      canPublishReply: true,
      canSchedule: true,
      source: "config",
    });
    mocks.getCapabilityFailureReason.mockReturnValue(null);
    mocks.shouldPublishViaNativeProvider.mockReturnValue(false);
    mocks.publishViaNativeProvider.mockResolvedValue({
      platform: "instagram",
      provider: "direct",
      accountId: "native-account",
      success: true,
      classification: "success",
    });
    mocks.publishToBird.mockResolvedValue({
      platform: "twitter",
      provider: "bird",
      accountId: "bird-account",
      success: true,
      classification: "success",
    });
    mocks.publishToLate.mockResolvedValue([
      {
        platform: "linkedin",
        provider: "late",
        accountId: "late-account",
        success: true,
        classification: "success",
      },
    ]);
  });

  it("passes media arrays to native providers", async () => {
    const platform = {
      id: "platform-1",
      type: "instagram",
      provider: "direct",
      accountId: "native-account",
      enabled: true,
      config: {},
    } as unknown as TestPlatform;

    mocks.shouldPublishViaNativeProvider.mockReturnValue(true);

    const result = await publishPlatformTargets([
      {
        platform,
        content: "Carousel caption",
        mediaUrls: [
          "https://cdn.example.com/one.jpg",
          "https://cdn.example.com/two.jpg",
        ],
      },
    ]);

    expect(mocks.publishViaNativeProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrls: [
          "https://cdn.example.com/one.jpg",
          "https://cdn.example.com/two.jpg",
        ],
      })
    );
    expect(result.outcomes[0]?.success).toBe(true);
  });

  it("passes media arrays to Late providers", async () => {
    const platform = {
      id: "platform-2",
      type: "linkedin",
      provider: "zernio",
      accountId: "late-account",
      enabled: true,
      config: {},
    } as unknown as TestPlatform;

    const result = await publishPlatformTargets([
      {
        platform,
        content: "Shared caption",
        mediaUrls: [
          "https://cdn.example.com/one.jpg",
          "https://cdn.example.com/two.jpg",
        ],
      },
    ]);

    expect(mocks.publishToLate).toHaveBeenCalledWith([
      expect.objectContaining({
        mediaUrls: [
          "https://cdn.example.com/one.jpg",
          "https://cdn.example.com/two.jpg",
        ],
      }),
    ]);
    expect(result.outcomes[0]?.success).toBe(true);
  });

  it("uses Bird as primary when a Direct X target has a matching Bird connection", async () => {
    const directPlatform = {
      id: "direct-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "direct",
      accountId: "direct-account",
      handle: "@max",
      enabled: true,
      config: { authMethod: "x_oauth" },
    } as unknown as TestPlatform;
    const birdPlatform = {
      id: "bird-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "bird",
      accountId: "bird-account",
      handle: "@max",
      enabled: true,
      config: {
        credentials: {
          enableDirectFallbackForPublishing: true,
        },
      },
    } as unknown as TestPlatform;

    mocks.dbRows = [birdPlatform];
    mocks.shouldPublishViaNativeProvider.mockImplementation((platform) => {
      return platform.provider === "direct";
    });

    const result = await publishPlatformTargets([
      {
        platform: directPlatform,
        content: "Bird first",
        mediaUrls: ["https://cdn.example.com/one.jpg"],
      },
    ]);

    expect(mocks.publishToBird).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: birdPlatform,
        mediaUrls: ["https://cdn.example.com/one.jpg"],
      })
    );
    expect(mocks.publishViaNativeProvider).not.toHaveBeenCalled();
    expect(result.outcomes[0]?.provider).toBe("bird");
    expect(result.outcomes[0]?.success).toBe(true);
  });

  it("falls back to Direct X when Bird primary fails", async () => {
    const birdPlatform = {
      id: "bird-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "bird",
      accountId: "bird-account",
      handle: "@max",
      enabled: true,
      config: {
        credentials: {
          enableDirectFallbackForPublishing: true,
        },
      },
    } as unknown as TestPlatform;
    const directPlatform = {
      id: "direct-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "direct",
      accountId: "direct-account",
      handle: "@max",
      enabled: true,
      config: { authMethod: "x_oauth" },
    } as unknown as TestPlatform;

    mocks.dbRows = [directPlatform];
    mocks.shouldPublishViaNativeProvider.mockImplementation((platform) => {
      return platform.provider === "direct";
    });
    mocks.publishToBird.mockResolvedValueOnce({
      platform: "twitter",
      provider: "bird",
      accountId: "bird-account",
      success: false,
      classification: "auth_error",
      error: "Media upload failed: HTTP 401",
    });
    mocks.publishViaNativeProvider.mockResolvedValueOnce({
      platform: "twitter",
      provider: "direct",
      accountId: "direct-account",
      success: true,
      classification: "success",
      postId: "tweet-1",
    });

    const result = await publishPlatformTargets([
      {
        platform: birdPlatform,
        content: "Fallback post",
        mediaUrls: ["https://cdn.example.com/one.jpg"],
      },
    ]);

    expect(mocks.publishToBird).toHaveBeenCalledOnce();
    expect(mocks.publishViaNativeProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: directPlatform,
        mediaUrls: ["https://cdn.example.com/one.jpg"],
      })
    );
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({
        provider: "direct",
        success: true,
        postId: "tweet-1",
      })
    );
  });

  it("retries X through Bird without media when the media URL is stale", async () => {
    const birdPlatform = {
      id: "bird-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "bird",
      accountId: "bird-account",
      handle: "@max",
      enabled: true,
      config: {
        credentials: {
          enableDirectFallbackForPublishing: true,
        },
      },
    } as unknown as TestPlatform;

    mocks.publishToBird
      .mockResolvedValueOnce({
        platform: "twitter",
        provider: "bird",
        accountId: "bird-account",
        success: false,
        classification: "provider_error",
        error: "Failed to fetch media: 404",
      })
      .mockResolvedValueOnce({
        platform: "twitter",
        provider: "bird",
        accountId: "bird-account",
        success: true,
        classification: "success",
        postId: "tweet-text-only",
        raw: { threadParts: 1 },
      });

    const result = await publishPlatformTargets([
      {
        platform: birdPlatform,
        content: "Fallback text post",
        mediaUrls: ["https://cdn.example.com/missing.jpg"],
        mediaType: "image",
      },
    ]);

    expect(mocks.publishToBird).toHaveBeenCalledTimes(2);
    expect(mocks.publishToBird).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        platform: birdPlatform,
        content: "Fallback text post",
      })
    );
    expect(mocks.publishToBird.mock.calls[1]?.[0]).not.toHaveProperty(
      "mediaUrls"
    );
    expect(mocks.publishViaNativeProvider).not.toHaveBeenCalled();
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({
        provider: "bird",
        success: true,
        postId: "tweet-text-only",
      })
    );
    expect(result.outcomes[0]?.raw).toEqual(
      expect.objectContaining({
        mediaFallback: expect.objectContaining({
          action: "published_without_media",
          primaryError: "Failed to fetch media: 404",
        }),
      })
    );
  });

  it("uses text-only Direct fallback after an X media fetch failure", async () => {
    const birdPlatform = {
      id: "bird-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "bird",
      accountId: "bird-account",
      handle: "@max",
      enabled: true,
      config: {
        credentials: {
          enableDirectFallbackForPublishing: true,
        },
      },
    } as unknown as TestPlatform;
    const directPlatform = {
      id: "direct-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "direct",
      accountId: "direct-account",
      handle: "@max",
      enabled: true,
      config: { authMethod: "x_oauth" },
    } as unknown as TestPlatform;

    mocks.dbRows = [directPlatform];
    mocks.shouldPublishViaNativeProvider.mockImplementation((platform) => {
      return platform.provider === "direct";
    });
    mocks.publishToBird
      .mockResolvedValueOnce({
        platform: "twitter",
        provider: "bird",
        accountId: "bird-account",
        success: false,
        classification: "provider_error",
        error: "Failed to fetch media: 404",
      })
      .mockResolvedValueOnce({
        platform: "twitter",
        provider: "bird",
        accountId: "bird-account",
        success: false,
        classification: "auth_error",
        error: "Bird auth failed",
      });
    mocks.publishViaNativeProvider.mockResolvedValueOnce({
      platform: "twitter",
      provider: "direct",
      accountId: "direct-account",
      success: true,
      classification: "success",
      postId: "tweet-direct-text",
    });

    const result = await publishPlatformTargets([
      {
        platform: birdPlatform,
        content: "Direct text fallback",
        mediaUrls: ["https://cdn.example.com/missing.jpg"],
        mediaType: "image",
      },
    ]);

    expect(mocks.publishViaNativeProvider).toHaveBeenCalledWith(
      expect.not.objectContaining({
        mediaUrls: expect.anything(),
      })
    );
    expect(mocks.publishViaNativeProvider).toHaveBeenCalledWith(
      expect.not.objectContaining({
        mediaUrl: expect.anything(),
      })
    );
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({
        provider: "direct",
        success: true,
        postId: "tweet-direct-text",
      })
    );
  });

  it("does not use Direct X fallback unless the Bird config enables it", async () => {
    const birdPlatform = {
      id: "bird-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "bird",
      accountId: "bird-account",
      handle: "@max",
      enabled: true,
      config: {},
    } as unknown as TestPlatform;
    const directPlatform = {
      id: "direct-x",
      workspaceId: "workspace-1",
      type: "twitter",
      provider: "direct",
      accountId: "direct-account",
      handle: "@max",
      enabled: true,
      config: { authMethod: "x_oauth" },
    } as unknown as TestPlatform;

    mocks.dbRows = [directPlatform];
    mocks.shouldPublishViaNativeProvider.mockImplementation((platform) => {
      return platform.provider === "direct";
    });
    mocks.publishToBird.mockResolvedValueOnce({
      platform: "twitter",
      provider: "bird",
      accountId: "bird-account",
      success: false,
      classification: "auth_error",
      error: "Media upload failed: HTTP 401",
    });

    const result = await publishPlatformTargets([
      {
        platform: birdPlatform,
        content: "No direct fallback",
        mediaUrls: ["https://cdn.example.com/one.jpg"],
      },
    ]);

    expect(mocks.publishViaNativeProvider).not.toHaveBeenCalled();
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({
        provider: "bird",
        success: false,
        error: "Media upload failed: HTTP 401",
      })
    );
  });
});
