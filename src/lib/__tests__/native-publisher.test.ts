import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

import {
  publishViaNativeProvider,
  shouldPublishViaNativeProvider,
} from "@/lib/providers/native-publisher";

describe("native publisher routing", () => {
  it("uses native X OAuth rows created before the auth method was renamed", () => {
    expect(
      shouldPublishViaNativeProvider({
        provider: "direct",
        type: "twitter",
        config: {
          authMethod: "twitter_native",
          credentials: {
            accessToken: "token",
            refreshToken: "refresh",
          },
        },
      })
    ).toBe(true);
  });

  it("uses current X OAuth rows", () => {
    expect(
      shouldPublishViaNativeProvider({
        provider: "direct",
        type: "twitter",
        config: {
          authMethod: "x_oauth",
          credentials: {
            accessToken: "token",
            refreshToken: "refresh",
          },
        },
      })
    ).toBe(true);
  });

  it("does not route Bird or Zernio X rows through native OAuth", () => {
    expect(
      shouldPublishViaNativeProvider({
        provider: "bird",
        type: "twitter",
        config: { authMethod: "bird_cli" },
      })
    ).toBe(false);

    expect(
      shouldPublishViaNativeProvider({
        provider: "zernio",
        type: "twitter",
        config: { authMethod: "late_account" },
      })
    ).toBe(false);
  });
});

describe("native publisher X media scope guard", () => {
  it("asks for reconnect when X media publishing lacks media.write", async () => {
    const result = await publishViaNativeProvider({
      platform: {
        id: "platform-1",
        provider: "direct",
        type: "twitter",
        accountId: "x-account",
        config: {
          authMethod: "twitter_native",
          credentials: {
            accessToken: "token",
            scope: "tweet.write users.read tweet.read offline.access",
          },
        },
      } as never,
      content: "Image post",
      mediaUrls: ["https://cdn.example.com/image.png"],
    });

    expect(result.success).toBe(false);
    expect(result.classification).toBe("auth_error");
    expect(result.error).toContain("media.write");
    expect(result.error).toContain("Reconnect");
  });
});
