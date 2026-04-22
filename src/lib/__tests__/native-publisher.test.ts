import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

import { shouldPublishViaNativeProvider } from "@/lib/providers/native-publisher";

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
