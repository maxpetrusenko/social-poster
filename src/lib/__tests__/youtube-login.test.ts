import { describe, expect, it } from "vitest";

import { getProvider } from "../providers/registry.ts";

describe("YouTube OAuth", () => {
  it("uses incremental Google authorization without forcing consent every connect", () => {
    const provider = getProvider("youtube", {
      clientId: "youtube-client-id",
      clientSecret: "youtube-client-secret",
    });

    const url = new URL(provider.getAuthUrl("https://app.example/callback", "state"));

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("youtube-client-id");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.has("prompt")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(
      [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ].join(" ")
    );
  });
});
