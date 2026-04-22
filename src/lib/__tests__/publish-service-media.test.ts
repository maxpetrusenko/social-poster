import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishViaNativeProvider: vi.fn(),
  shouldPublishViaNativeProvider: vi.fn(),
  publishToLate: vi.fn(),
  publishToBird: vi.fn(),
  getPlatformCapabilities: vi.fn(),
  getCapabilityFailureReason: vi.fn(),
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
});
