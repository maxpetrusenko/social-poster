import { describe, expect, it } from "vitest";

import {
  appendOAuthFlowCookieFlow,
  decodeOAuthFlowCookie,
  encodeOAuthFlowCookie,
  findOAuthFlowCookieFlow,
  oauthFlowCookieFlows,
  removeOAuthFlowCookieFlow,
  type OAuthFlowCookie,
} from "./flow-state";

describe("OAuth flow cookie state", () => {
  it("stores several pending nonces without losing older callbacks", () => {
    const cookie = appendOAuthFlowCookieFlow(
      appendOAuthFlowCookieFlow(null, {
        nonce: "first",
        codeVerifier: "verifier-1",
        redirectUri: "https://social.maxpetrusenko.com/api/auth/callback",
        timestamp: 1_000,
      }),
      {
        nonce: "second",
        codeVerifier: "verifier-2",
        redirectUri: "https://social.maxpetrusenko.com/api/auth/callback",
        timestamp: 2_000,
      },
      2_000
    );

    expect(cookie.nonce).toBe("second");
    expect(findOAuthFlowCookieFlow(cookie, "first")?.codeVerifier).toBe(
      "verifier-1"
    );
    expect(findOAuthFlowCookieFlow(cookie, "second")?.codeVerifier).toBe(
      "verifier-2"
    );
  });

  it("round-trips encoded pending flows", () => {
    const cookie = appendOAuthFlowCookieFlow(null, {
      nonce: "nonce",
      codeVerifier: "verifier",
      credentials: { clientId: "client", clientSecret: "secret" },
      timestamp: 1_000,
    });

    const decoded = decodeOAuthFlowCookie(encodeOAuthFlowCookie(cookie));

    expect(findOAuthFlowCookieFlow(decoded, "nonce")).toMatchObject({
      codeVerifier: "verifier",
      credentials: { clientId: "client", clientSecret: "secret" },
    });
  });

  it("consumes one matching nonce and leaves other pending attempts", () => {
    const cookie = appendOAuthFlowCookieFlow(
      appendOAuthFlowCookieFlow(null, {
        nonce: "first",
        timestamp: 1_000,
      }),
      {
        nonce: "second",
        timestamp: 2_000,
      },
      2_000
    );

    const remaining = removeOAuthFlowCookieFlow(cookie, "first", 2_000);

    expect(findOAuthFlowCookieFlow(remaining, "first")).toBeNull();
    expect(findOAuthFlowCookieFlow(remaining, "second")?.nonce).toBe("second");
  });

  it("prunes expired pending attempts on append", () => {
    const cookie = appendOAuthFlowCookieFlow(
      appendOAuthFlowCookieFlow(null, {
        nonce: "expired",
        timestamp: 1_000,
      }),
      {
        nonce: "fresh",
        timestamp: 1_000 + 10 * 60 * 1000 + 1,
      },
      1_000 + 10 * 60 * 1000 + 1
    );

    expect(oauthFlowCookieFlows(cookie).map((flow) => flow.nonce)).toEqual([
      "fresh",
    ]);
  });

  it("caps pending attempts to avoid unbounded cookie growth", () => {
    let cookie: OAuthFlowCookie | null = null;
    for (let index = 0; index < 8; index += 1) {
      cookie = appendOAuthFlowCookieFlow(
        cookie,
        { nonce: `nonce-${index}`, timestamp: index },
        index
      );
    }

    expect(oauthFlowCookieFlows(cookie).map((flow) => flow.nonce)).toEqual([
      "nonce-7",
      "nonce-6",
      "nonce-5",
      "nonce-4",
      "nonce-3",
    ]);
  });
});
