import assert from "node:assert/strict";
import test from "node:test";

import { TwitterProvider } from "./twitter.ts";

type FetchCall = {
  url: URL;
  init: RequestInit | undefined;
};

test("Twitter/X deletes authored posts through API v2", async () => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return jsonResponse({ data: { deleted: true } });
  };

  try {
    const provider = new TwitterProvider({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
    });

    const result = await provider.deletePost("user-access-token", "1234567890");

    assert.equal(result.deleted, true);
    assert.equal(calls[0].url.toString(), "https://api.x.com/2/tweets/1234567890");
    assert.equal(calls[0].init?.method, "DELETE");
    assert.equal(
      new Headers(calls[0].init?.headers).get("authorization"),
      "Bearer user-access-token"
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
