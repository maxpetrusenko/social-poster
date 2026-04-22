import test from "node:test";
import assert from "node:assert/strict";
import { getAuthConfigError, resolveAuthMode } from "./auth-config.ts";

test("resolveAuthMode fails closed in production without supabase", () => {
  assert.equal(
    resolveAuthMode({
      NODE_ENV: "production",
      DISABLE_AUTH: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    }),
    "misconfigured"
  );
});

test("resolveAuthMode uses supabase in production when configured", () => {
  assert.equal(
    resolveAuthMode({
      NODE_ENV: "production",
      DISABLE_AUTH: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    }),
    "supabase"
  );
});

test("resolveAuthMode keeps local magic-link path when bypass is disabled", () => {
  assert.equal(
    resolveAuthMode({
      NODE_ENV: "development",
      DISABLE_AUTH: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    }),
    "magic_link"
  );
});

test("resolveAuthMode keeps local magic-link path when bypass is unset", () => {
  assert.equal(
    resolveAuthMode({
      NODE_ENV: "development",
      DISABLE_AUTH: undefined,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    }),
    "magic_link"
  );
});

test("getAuthConfigError explains production bypass failures", () => {
  assert.match(
    getAuthConfigError({
      NODE_ENV: "production",
      DISABLE_AUTH: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    }) ?? "",
    /bypass is forbidden/i
  );
});
