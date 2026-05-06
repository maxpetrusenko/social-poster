import { describe, expect, it } from "vitest";

import { FacebookProvider } from "../providers/facebook";

describe("Facebook Page OAuth", () => {
  it("requests only the minimum direct page publishing scopes by default", () => {
    const provider = new FacebookProvider({
      clientId: "facebook-app-id",
      clientSecret: "facebook-app-secret",
    });

    const url = new URL(
      provider.getAuthUrl("https://app.example/api/auth/callback", "state")
    );

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v21.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("facebook-app-id");
    expect(url.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts"
    );
  });
});
