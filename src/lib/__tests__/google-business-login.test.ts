import { describe, expect, it } from "vitest";

import { getProvider } from "../providers/registry.ts";

describe("Google Business OAuth", () => {
  it("reuses granted Google sessions instead of forcing consent every connect", () => {
    const provider = getProvider("google_business", {
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    });

    const url = new URL(provider.getAuthUrl("https://app.example/callback", "state"));

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.has("prompt")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/business.manage"
    );
  });
});
