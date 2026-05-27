import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { TwitterProvider } from "./twitter.ts";

type FetchCall = {
  url: URL;
  init: RequestInit | undefined;
};

test("Twitter/X advertises native image and video media support", () => {
  const provider = new TwitterProvider({
    clientId: "x-client-id",
    clientSecret: "x-client-secret",
  });

  assert.ok(provider.supportedPostTypes.includes("text"));
  assert.ok(provider.supportedPostTypes.includes("image"));
  assert.ok(provider.supportedPostTypes.includes("video"));

  for (const mediaType of ["jpeg", "png", "gif", "webp", "mp4", "mov"] as const) {
    assert.ok(provider.supportedMediaTypes.includes(mediaType));
  }
});

test("Twitter/X publishes text-only posts through API v2 without media upload", async () => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    assert.equal(url.pathname, "/2/tweets");
    return jsonResponse({ data: { id: "tweet-123" } });
  };

  try {
    const provider = new TwitterProvider({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
    });

    const result = await provider.publishPost("user-access-token", {
      text: "Plain text still takes the existing path.",
    });

    assert.equal(result.platformPostId, "tweet-123");
    assert.equal(result.url, "https://x.com/i/web/status/tweet-123");
    assert.deepEqual(
      calls.map((call) => call.url.toString()),
      ["https://api.x.com/2/tweets"]
    );
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(
      new Headers(calls[0].init?.headers).get("authorization"),
      "Bearer user-access-token"
    );
    assert.deepEqual(await readBody(calls[0].init), {
      text: "Plain text still takes the existing path.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Twitter/X uploads image media through X API v2 before creating a post", async () => {
  const imageBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);
  const tempDir = await mkdtemp(join(tmpdir(), "twitter-media-upload-"));
  const imagePath = join(tempDir, "post-image.png");
  await writeFile(imagePath, imageBytes);

  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });

    if (url.pathname === "/2/media/upload/initialize") {
      return jsonResponse({ data: { id: "media-123", media_key: "3_media-123" } });
    }
    if (url.pathname === "/2/media/upload/media-123/append") {
      return jsonResponse({ data: { expires_at: 1_900_000_000 } });
    }
    if (url.pathname === "/2/media/upload/media-123/finalize") {
      return jsonResponse({
        data: {
          id: "media-123",
          media_key: "3_media-123",
          processing_info: { state: "succeeded" },
        },
      });
    }
    if (url.pathname === "/2/tweets") {
      return jsonResponse({ data: { id: "tweet-456" } });
    }

    return jsonResponse({ errors: [{ title: `Unexpected URL ${url.toString()}` }] }, 500);
  };

  try {
    const provider = new TwitterProvider({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
    });

    const result = await provider.publishPost("user-access-token", {
      text: "Image post",
      postType: "image",
      mediaFiles: [imagePath],
    });

    assert.equal(result.platformPostId, "tweet-456");
    assert.deepEqual(
      calls.map((call) => call.url.toString()),
      [
        "https://api.x.com/2/media/upload/initialize",
        "https://api.x.com/2/media/upload/media-123/append",
        "https://api.x.com/2/media/upload/media-123/finalize",
        "https://api.x.com/2/tweets",
      ]
    );
    for (const call of calls) {
      assert.equal(call.init?.method, "POST");
      assert.equal(
        new Headers(call.init?.headers).get("authorization"),
        "Bearer user-access-token"
      );
    }

    assert.deepEqual(await readBody(calls[0].init), {
      total_bytes: imageBytes.length,
      media_type: "image/png",
      media_category: "tweet_image",
    });

    const appendBody = await readBody(calls[1].init);
    assert.equal(String(readField(appendBody, "segment_index")), "0");
    await assertMediaBody(readField(appendBody, "media"), imageBytes);

    assert.deepEqual(await readBody(calls[2].init), {});
    assert.deepEqual(await readBody(calls[3].init), {
      text: "Image post",
      media: { media_ids: ["media-123"] },
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Twitter/X resolves relative media URLs against the configured app URL", async () => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  const originalAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://social.example.com";

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });

    if (url.toString() === "https://social.example.com/uploads/post-image.png") {
      return new Response(imageBytes, {
        headers: { "Content-Type": "image/png" },
      });
    }
    if (url.pathname === "/2/media/upload/initialize") {
      return jsonResponse({ data: { id: "media-789", media_key: "3_media-789" } });
    }
    if (url.pathname === "/2/media/upload/media-789/append") {
      return jsonResponse({ data: { expires_at: 1_900_000_000 } });
    }
    if (url.pathname === "/2/media/upload/media-789/finalize") {
      return jsonResponse({
        data: {
          id: "media-789",
          media_key: "3_media-789",
          processing_info: { state: "succeeded" },
        },
      });
    }
    if (url.pathname === "/2/tweets") {
      return jsonResponse({ data: { id: "tweet-789" } });
    }

    return jsonResponse({ errors: [{ title: `Unexpected URL ${url.toString()}` }] }, 500);
  };

  try {
    const provider = new TwitterProvider({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
    });

    const result = await provider.publishPost("user-access-token", {
      text: "Relative image post",
      postType: "image",
      mediaUrls: ["/uploads/post-image.png"],
    });

    assert.equal(result.platformPostId, "tweet-789");
    assert.deepEqual(
      calls.map((call) => call.url.toString()),
      [
        "https://social.example.com/uploads/post-image.png",
        "https://api.x.com/2/media/upload/initialize",
        "https://api.x.com/2/media/upload/media-789/append",
        "https://api.x.com/2/media/upload/media-789/finalize",
        "https://api.x.com/2/tweets",
      ]
    );
    assert.deepEqual(await readBody(calls[1].init), {
      total_bytes: imageBytes.length,
      media_type: "image/png",
      media_category: "tweet_image",
    });
    assert.deepEqual(await readBody(calls[4].init), {
      text: "Relative image post",
      media: { media_ids: ["media-789"] },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = originalAppUrl;
    }
  }
});

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(init: RequestInit | undefined): Promise<unknown> {
  const body = init?.body;
  if (!body) return {};
  if (typeof body === "string") {
    return body ? JSON.parse(body) : {};
  }
  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }
  if (body instanceof FormData) {
    return Object.fromEntries(body.entries());
  }
  if (body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  return body;
}

function readField(body: unknown, key: string): unknown {
  assert.ok(body && typeof body === "object" && !Array.isArray(body));
  return (body as Record<string, unknown>)[key];
}

async function assertMediaBody(value: unknown, expected: Buffer) {
  if (typeof value === "string") {
    assert.ok(value.length > 0);
    return;
  }
  if (value instanceof Blob) {
    assert.deepEqual(Buffer.from(await value.arrayBuffer()), expected);
    return;
  }
  if (value instanceof ArrayBuffer) {
    assert.deepEqual(Buffer.from(value), expected);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    assert.deepEqual(
      Buffer.from(value.buffer, value.byteOffset, value.byteLength),
      expected
    );
    return;
  }
  assert.fail("Append request should include media bytes or base64 media");
}
