import { describe, expect, it } from "vitest";

import { TwitterProvider } from "@/lib/providers/twitter";

describe("Twitter/X OAuth", () => {
  it("requests only the minimum posting consent scopes by default", () => {
    const provider = new TwitterProvider({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
    });

    const url = new URL(
      provider.getAuthUrl("http://127.0.0.1:3001/api/auth/callback", "state", "verifier")
    );

    expect(url.origin).toBe("https://x.com");
    expect(url.pathname).toBe("/i/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("x-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3001/api/auth/callback"
    );
    expect(url.searchParams.get("scope")).toBe(
      "tweet.read tweet.write users.read offline.access"
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
