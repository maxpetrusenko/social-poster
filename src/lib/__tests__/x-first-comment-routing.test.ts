import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishPost: vi.fn(),
  publishToBird: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { update: vi.fn(), select: vi.fn() } }));
vi.mock("@/lib/providers/registry", () => ({
  getProvider: () => ({ publishPost: mocks.publishPost }),
  hasNativeProvider: () => true,
}));
vi.mock("@/lib/pipeline/bird-publisher", () => ({ publishToBird: mocks.publishToBird }));
vi.mock("@/lib/platform-capabilities", () => ({
  getPlatformCapabilities: () => ({}),
  getCapabilityFailureReason: () => null,
}));
vi.mock("@/lib/platform-auth-status", () => ({
  clearPlatformAuthFailure: vi.fn(),
  recordAuthFailureFromError: vi.fn(),
}));

import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import { publishViaNativeProvider } from "@/lib/providers/native-publisher";

type Platform = Parameters<typeof publishPlatformTargets>[0][number]["platform"];

const xDirect = {
  id: "x1",
  workspaceId: "w1",
  type: "twitter",
  provider: "direct",
  accountId: "u1",
  handle: "@u",
  name: "X",
  enabled: true,
  config: { authMethod: "x_oauth", credentials: { accessToken: "t", scope: "tweet.write media.write" } },
} as unknown as Platform;

describe("X firstComment routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps the provider self-reply into the pipeline result", async () => {
    mocks.publishPost.mockResolvedValue({
      platformPostId: "1",
      url: "https://x.com/i/web/status/1",
      extra: { firstComment: { id: "2", url: "https://x.com/i/web/status/2" } },
    });
    const result = await publishViaNativeProvider({ platform: xDirect, content: "hi", firstComment: "c" });
    expect(mocks.publishPost.mock.calls[0][1].firstComment).toBe("c");
    expect(result.firstComment).toEqual({ success: true, id: "2", url: "https://x.com/i/web/status/2" });
  });

  it("records a reply error without failing the main post", async () => {
    mocks.publishPost.mockResolvedValue({
      platformPostId: "1",
      extra: { firstCommentError: "403 forbidden" },
    });
    const result = await publishViaNativeProvider({ platform: xDirect, content: "hi", firstComment: "c" });
    expect(result.success).toBe(true);
    expect(result.firstComment).toEqual({ success: false, error: "403 forbidden" });
  });

  it("passes firstComment to the Bird publisher", async () => {
    mocks.publishToBird.mockResolvedValue({
      platform: "twitter", provider: "bird", accountId: null, success: true, classification: "success",
    });
    const bird = { ...xDirect, provider: "bird", config: {} } as unknown as Platform;
    await publishPlatformTargets([{ platform: bird, content: "hi", firstComment: "reply text" }]);
    expect(mocks.publishToBird.mock.calls[0][0].firstComment).toBe("reply text");
  });
});
