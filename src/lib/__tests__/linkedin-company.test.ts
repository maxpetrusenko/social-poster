import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkedInCompanyProvider } from "../providers/linkedin-company";

type FetchCall = {
  url: URL;
  init: RequestInit | undefined;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("LinkedIn Page OAuth", () => {
  it("requests the page admin scope LinkedIn expects", () => {
    const provider = new LinkedInCompanyProvider({
      clientId: "linkedin-client-id",
      clientSecret: "linkedin-client-secret",
    });

    const url = new URL(
      provider.getAuthUrl("https://app.example/api/auth/callback", "state")
    );

    expect(url.origin).toBe("https://www.linkedin.com");
    expect(url.pathname).toBe("/oauth/v2/authorization");
    expect(url.searchParams.get("client_id")).toBe("linkedin-client-id");
    expect(url.searchParams.get("scope")).toBe(provider.requiredScopes.join(" "));
    expect(provider.requiredScopes).toContain("rw_organization_admin");
    expect(provider.requiredScopes).not.toContain("r_organization_admin");
  });

  it("resolves the administered organization during callback profile loading", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });

      if (url.pathname === "/v2/userinfo") {
        return jsonResponse({
          sub: "member-123",
          name: "Max Member",
          picture: "https://example.com/member.jpg",
        });
      }

      if (url.pathname === "/rest/organizationAuthorizations") {
        return jsonResponse({
          elements: [
            {
              elements: [
                {
                  organization: "urn:li:organization:987",
                  status: {
                    "com.linkedin.organization.Approved": {},
                  },
                },
              ],
            },
          ],
        });
      }

      if (url.pathname === "/rest/organizations/987") {
        return jsonResponse({
          localizedName: "Acme Page",
          vanityName: "acme-page",
          logoV2: { original: "https://example.com/page.png" },
        });
      }

      return jsonResponse({ message: `Unexpected URL ${url.toString()}` }, 500);
    });

    const provider = new LinkedInCompanyProvider({
      clientId: "linkedin-client-id",
      clientSecret: "linkedin-client-secret",
    });

    const profile = await provider.getProfile("page-token");

    expect(profile.platformId).toBe("urn:li:organization:987");
    expect(profile.name).toBe("Acme Page");
    expect(profile.handle).toBe("acme-page");
    expect(profile.avatarUrl).toBe("https://example.com/page.png");
    expect(calls.map((call) => call.url.pathname)).toEqual([
      "/v2/userinfo",
      "/rest/organizationAuthorizations",
      "/rest/organizations/987",
    ]);
    expect(calls[1].url.searchParams.get("bq")).toBe(
      "authorizationActionsAndImpersonator"
    );
    expect(calls[1].url.searchParams.get("authorizationActions")).toContain(
      "ORGANIC_SHARE_CREATE"
    );
    expect(new Headers(calls[1].init?.headers).get("authorization")).toBe(
      "Bearer page-token"
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
