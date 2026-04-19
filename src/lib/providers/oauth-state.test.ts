import assert from "node:assert/strict";
import test from "node:test";

import {
  oauthCallbackUrl,
  signOAuthState,
  verifyOAuthState,
  resolveOAuthCallbackOverride,
} from "./oauth-state.ts";

// --- oauthCallbackUrl (request-derived) ---

test("oauthCallbackUrl derives URL from request headers", () => {
  const request = {
    headers: new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "social.maxpetrusenko.com",
    }),
  };
  assert.equal(
    oauthCallbackUrl("linkedin_personal", request),
    "https://social.maxpetrusenko.com/api/auth/callback/linkedin-personal"
  );
});

test("oauthCallbackUrl falls back to host header", () => {
  const request = {
    headers: new Headers({ host: "localhost:3000" }),
    url: "http://localhost:3000/api/auth/linkedin",
  };
  assert.equal(
    oauthCallbackUrl("twitter", request),
    "http://localhost:3000/api/auth/callback/twitter"
  );
});

test("oauthCallbackUrl replaces underscores with dashes", () => {
  const request = {
    headers: new Headers({ host: "localhost:3000" }),
    url: "http://localhost:3000/test",
  };
  assert.equal(
    oauthCallbackUrl("linkedin_company", request),
    "http://localhost:3000/api/auth/callback/linkedin-company"
  );
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
