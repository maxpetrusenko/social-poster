import assert from "node:assert/strict";
import test from "node:test";

import { InstagramPersonalProvider } from "./instagram-personal.ts";

type FetchCall = {
  url: URL;
  init: RequestInit | undefined;
};

test("Instagram personal OAuth uses the current Instagram authorization host", () => {
  const provider = new InstagramPersonalProvider({
    clientId: "ig-app-id",
    clientSecret: "ig-app-secret",
  });

  const url = new URL(provider.getAuthUrl("https://app.example/callback", "state"));
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "ig-app-id");
  assert.equal(url.searchParams.get("scope"), provider.requiredScopes.join(","));
});

test("Instagram personal exchanges short-lived tokens at the unversioned long-lived token endpoint", async () => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });

    if (url.origin === "https://api.instagram.com") {
      return jsonResponse({
        access_token: "short-token",
        user_id: "scoped-user-id",
      });
    }

    return jsonResponse({
      access_token: "long-token",
      token_type: "bearer",
      expires_in: 5_183_944,
    });
  };

  try {
    const provider = new InstagramPersonalProvider({
      clientId: "ig-app-id",
      clientSecret: "ig-app-secret",
    });

    const tokens = await provider.exchangeCode(
      "auth-code",
      "https://app.example/callback"
    );

    assert.equal(tokens.accessToken, "long-token");
    assert.equal(calls[0].url.toString(), "https://api.instagram.com/oauth/access_token");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[1].url.origin, "https://graph.instagram.com");
    assert.equal(calls[1].url.pathname, "/access_token");
    assert.equal(calls[1].url.searchParams.get("grant_type"), "ig_exchange_token");
    assert.equal(calls[1].url.searchParams.get("access_token"), "short-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram personal Graph requests send the access token as a query parameter", async () => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return jsonResponse({
      user_id: "ig-user-id",
      username: "max",
      name: "Max",
    });
  };

  try {
    const provider = new InstagramPersonalProvider({
      clientId: "ig-app-id",
      clientSecret: "ig-app-secret",
    });

    const profile = await provider.getProfile("profile-token");

    assert.equal(profile.platformId, "ig-user-id");
    assert.equal(profile.handle, "max");
    assert.equal(calls[0].url.pathname, "/v25.0/me");
    assert.equal(calls[0].url.searchParams.get("access_token"), "profile-token");
    assert.equal(calls[0].url.searchParams.get("fields"), "user_id,username,name,profile_picture_url,followers_count");
    assert.equal(
      new Headers(calls[0].init?.headers).get("authorization"),
      null
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
