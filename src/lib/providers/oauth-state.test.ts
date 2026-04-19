import assert from "node:assert/strict";
import test from "node:test";

import {
  oauthCallbackUrl,
  resolveOAuthCallbackOverride,
} from "./oauth-state.ts";

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

test("oauthCallbackUrl ignores pinned production callback on localhost", () => {
  const previousOverride = process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL =
    "https://social.maxpetrusenko.com/api/auth/callback";

  try {
    assert.equal(
      oauthCallbackUrl("linkedin_personal", "http://localhost:3000"),
      "http://localhost:3000/api/auth/callback"
    );
  } finally {
    if (previousOverride === undefined) {
      delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
    } else {
      process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL = previousOverride;
    }
  }
});

test("oauthCallbackUrl keeps exact localhost callback when configured", () => {
  const previousOverride = process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
  process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL =
    "http://localhost:3000/api/auth/callback";

  try {
    assert.equal(
      oauthCallbackUrl("linkedin_personal", "http://127.0.0.1:3000"),
      "http://localhost:3000/api/auth/callback"
    );
  } finally {
    if (previousOverride === undefined) {
      delete process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL;
    } else {
      process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL = previousOverride;
    }
  }
});
