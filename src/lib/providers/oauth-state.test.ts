import assert from "node:assert/strict";
import { test } from "vitest";

import {
  oauthCallbackUrl,
  signOAuthState,
  verifyOAuthState,
  resolveOAuthCallbackOverride,
  appendNativeOAuthCookieFlow,
  findNativeOAuthCookieFlow,
  removeNativeOAuthCookieFlow,
  nativeOAuthCookieFlows,
} from "./oauth-state.ts";

// --- oauthCallbackUrl (request-derived) ---

test("oauthCallbackUrl derives URL from request headers", () => {
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  const request = {
    headers: new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "social.maxpetrusenko.com",
    }),
  };
  assert.equal(
    oauthCallbackUrl("linkedin_personal", request),
    "https://social.maxpetrusenko.com/api/auth/callback"
  );
});

test("oauthCallbackUrl falls back to host header", () => {
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  const request = {
    headers: new Headers({ host: "localhost:3000" }),
    url: "http://localhost:3000/api/auth/linkedin",
  };
  assert.equal(
    oauthCallbackUrl("twitter", request),
    "http://localhost:3000/api/auth/callback"
  );
});

test("oauthCallbackUrl defaults public hosts to HTTPS when proxy proto is missing", () => {
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  const request = {
    headers: new Headers({ host: "social.maxpetrusenko.com" }),
    url: "http://social.maxpetrusenko.com/api/auth/instagram",
  };
  assert.equal(
    oauthCallbackUrl("instagram", request),
    "https://social.maxpetrusenko.com/api/auth/callback"
  );
});

test("oauthCallbackUrl uses same-origin callback override", () => {
  process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL =
    "https://social.maxpetrusenko.com/api/auth/callback";
  const request = {
    headers: new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "social.maxpetrusenko.com",
    }),
  };
  assert.equal(
    oauthCallbackUrl("youtube", request),
    "https://social.maxpetrusenko.com/api/auth/callback"
  );
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
});

test("oauthCallbackUrl ignores production callback override on localhost", () => {
  process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL =
    "https://social.maxpetrusenko.com/api/auth/callback";
  const request = {
    headers: new Headers({ host: "localhost:3000" }),
    url: "http://localhost:3000/api/auth/youtube",
  };
  assert.equal(
    oauthCallbackUrl("youtube", request),
    "http://localhost:3000/api/auth/callback"
  );
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
});

test("oauthCallbackUrl uses 127.0.0.1 override for localhost requests", () => {
  process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL =
    "http://127.0.0.1:3000/api/auth/callback";
  const request = {
    headers: new Headers({ host: "localhost:3000" }),
    url: "http://localhost:3000/api/auth/youtube",
  };
  assert.equal(
    oauthCallbackUrl("youtube", request),
    "http://127.0.0.1:3000/api/auth/callback"
  );
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
});

test("oauthCallbackUrl uses X local bridge for HTTPS loopback requests", () => {
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  delete process.env.SOCIAL_POSTER_TWITTER_CALLBACK_URL;
  const request = {
    headers: new Headers({ host: "127.0.0.1:3000" }),
    url: "https://127.0.0.1:3000/api/auth/twitter",
  };
  assert.equal(
    oauthCallbackUrl("twitter", request),
    "http://127.0.0.1:3001/api/auth/callback"
  );
});

test("oauthCallbackUrl keeps HTTPS loopback callbacks for non-X providers", () => {
  delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  delete process.env.SOCIAL_POSTER_TWITTER_CALLBACK_URL;
  const request = {
    headers: new Headers({ host: "127.0.0.1:3000" }),
    url: "https://127.0.0.1:3000/api/auth/instagram",
  };
  const platforms = [
    "facebook",
    "google_business",
    "instagram",
    "linkedin_personal",
    "pinterest",
    "threads",
    "tiktok",
    "youtube",
  ];

  for (const platform of platforms) {
    assert.equal(
      oauthCallbackUrl(platform, request),
      "https://127.0.0.1:3000/api/auth/callback",
      platform
    );
  }
});

test("oauthCallbackUrl lets X-specific callback override the local bridge", () => {
  process.env.SOCIAL_POSTER_TWITTER_CALLBACK_URL =
    "http://127.0.0.1:3999/api/auth/callback";
  const request = {
    headers: new Headers({ host: "127.0.0.1:3000" }),
    url: "https://127.0.0.1:3000/api/auth/twitter",
  };
  assert.equal(
    oauthCallbackUrl("twitter", request),
    "http://127.0.0.1:3999/api/auth/callback"
  );
  delete process.env.SOCIAL_POSTER_TWITTER_CALLBACK_URL;
});

// --- signOAuthState / verifyOAuthState ---

test("signOAuthState produces verifiable state", () => {
  const payload = {
    nonce: "test-nonce",
    platform: "twitter",
    timestamp: Date.now(),
  };
  const signed = signOAuthState(payload);
  const result = verifyOAuthState(signed);
  assert.ok(result);
  assert.equal(result.nonce, "test-nonce");
  assert.equal(result.platform, "twitter");
});

test("verifyOAuthState rejects tampered state", () => {
  const signed = signOAuthState({
    nonce: "test",
    platform: "twitter",
    timestamp: Date.now(),
  });
  const tampered = signed.slice(0, -3) + "abc";
  assert.equal(verifyOAuthState(tampered), null);
});

test("verifyOAuthState rejects expired state", () => {
  const signed = signOAuthState({
    nonce: "test",
    platform: "twitter",
    timestamp: Date.now() - 700_000, // 11+ minutes ago
  });
  assert.equal(verifyOAuthState(signed), null);
});

test("verifyOAuthState rejects malformed input", () => {
  assert.equal(verifyOAuthState(""), null);
  assert.equal(verifyOAuthState("no-dot"), null);
  assert.equal(verifyOAuthState("."), null);
});

// --- resolveOAuthCallbackOverride (kept for UI usage) ---

test("resolveOAuthCallbackOverride ignores production callback on localhost", () => {
  assert.equal(
    resolveOAuthCallbackOverride(
      "https://social.maxpetrusenko.com/api/auth/callback",
      "http://localhost:3000"
    ),
    null
  );
});

test("resolveOAuthCallbackOverride keeps same-origin callback override", () => {
  assert.equal(
    resolveOAuthCallbackOverride(
      "https://social.maxpetrusenko.com/api/auth/callback",
      "https://social.maxpetrusenko.com"
    ),
    "https://social.maxpetrusenko.com/api/auth/callback"
  );
});

test("resolveOAuthCallbackOverride keeps exact loopback override", () => {
  assert.equal(
    resolveOAuthCallbackOverride(
      "http://localhost:3000/api/auth/callback",
      "http://127.0.0.1:3000"
    ),
    "http://localhost:3000/api/auth/callback"
  );
});

// --- native OAuth cookie flows ---

test("appendNativeOAuthCookieFlow keeps previous pending nonces", () => {
  const first = appendNativeOAuthCookieFlow(null, {
    nonce: "first",
    codeVerifier: "verifier-1",
    redirectUri: "https://social.maxpetrusenko.com/api/auth/callback",
    timestamp: 1_000,
  });
  const second = appendNativeOAuthCookieFlow(
    first,
    {
      nonce: "second",
      codeVerifier: "verifier-2",
      redirectUri: "https://social.maxpetrusenko.com/api/auth/callback",
      timestamp: 2_000,
    },
    2_000
  );

  assert.equal(second.nonce, "second");
  assert.equal(findNativeOAuthCookieFlow(second, "first")?.codeVerifier, "verifier-1");
  assert.equal(findNativeOAuthCookieFlow(second, "second")?.codeVerifier, "verifier-2");
});

test("removeNativeOAuthCookieFlow consumes only the matching nonce", () => {
  const cookie = appendNativeOAuthCookieFlow(
    appendNativeOAuthCookieFlow(null, {
      nonce: "first",
      codeVerifier: "verifier-1",
      timestamp: 1_000,
    }),
    {
      nonce: "second",
      codeVerifier: "verifier-2",
      timestamp: 2_000,
    },
    2_000
  );

  const remaining = removeNativeOAuthCookieFlow(cookie, "first", 2_000);

  assert.ok(remaining);
  assert.equal(findNativeOAuthCookieFlow(remaining, "first"), null);
  assert.equal(findNativeOAuthCookieFlow(remaining, "second")?.codeVerifier, "verifier-2");
});

test("appendNativeOAuthCookieFlow prunes expired pending nonces", () => {
  const cookie = appendNativeOAuthCookieFlow(
    appendNativeOAuthCookieFlow(null, {
      nonce: "expired",
      timestamp: 1_000,
    }),
    {
      nonce: "fresh",
      timestamp: 1_000 + 10 * 60 * 1000 + 1,
    },
    1_000 + 10 * 60 * 1000 + 1
  );

  assert.deepEqual(
    nativeOAuthCookieFlows(cookie).map((flow) => flow.nonce),
    ["fresh"]
  );
});
