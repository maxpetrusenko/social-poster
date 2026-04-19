import test from "node:test";
import assert from "node:assert/strict";
import { getAppUrlFromEnv, getRequestAppUrl } from "./app-url.ts";

test("getAppUrlFromEnv prefers APP_URL", () => {
  assert.equal(
    getAppUrlFromEnv({
      APP_URL: "https://social.maxpetrusenko.com",
      COOLIFY_URL: "https://coolify.example.com",
      NEXT_PUBLIC_APP_URL: "https://wrong.example.com",
    } as unknown as NodeJS.ProcessEnv),
    "https://social.maxpetrusenko.com"
  );
});

test("getAppUrlFromEnv falls back to first COOLIFY_URL origin", () => {
  assert.equal(
    getAppUrlFromEnv({
      COOLIFY_URL:
        "https://social.maxpetrusenko.com,https://social-origin.maxpetrusenko.com",
    } as unknown as NodeJS.ProcessEnv),
    "https://social.maxpetrusenko.com"
  );
});

test("getRequestAppUrl prefers forwarded host and protocol", () => {
  const headers = new Headers({
    "x-forwarded-host": "social.maxpetrusenko.com",
    "x-forwarded-proto": "https",
    host: "0.0.0.0:3000",
  });

  assert.equal(
    getRequestAppUrl({
      headers,
      url: "http://0.0.0.0:3000/auth/callback?next=%2Fdashboard",
    }),
    "https://social.maxpetrusenko.com"
  );
});

test("getRequestAppUrl keeps localhost on http without forwarded protocol", () => {
  assert.equal(
    getRequestAppUrl({
      headers: new Headers({ host: "localhost:3000" }),
      url: "http://localhost:3000/api/auth/linkedin",
    }),
    "http://localhost:3000"
  );
});

test("getRequestAppUrl falls back to request url origin", () => {
  assert.equal(
    getRequestAppUrl({
      headers: new Headers(),
      url: "https://social.maxpetrusenko.com/auth/callback",
    }),
    "https://social.maxpetrusenko.com"
  );
});
