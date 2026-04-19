import assert from "node:assert/strict";
import test from "node:test";

import { buildR2ObjectUrl, resolveR2Config, splitR2EndpointAndBucket } from "./r2-config.ts";

test("splitR2EndpointAndBucket accepts a bucket path in CLOUDFLARE_ENDPOINT", () => {
  const result = splitR2EndpointAndBucket(
    "https://account.r2.cloudflarestorage.com/social-agent"
  );

  assert.equal(result?.endpoint, "https://account.r2.cloudflarestorage.com");
  assert.equal(result?.bucket, "social-agent");
});

test("resolveR2Config uses Cloudflare account id plus explicit bucket", () => {
  const config = resolveR2Config({
    ACC_ID_CLOUDFLARE: "account",
    CLOUDFLARE_R2_BUCKET: "social-agent",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
  });

  assert.equal(config?.endpoint, "https://account.r2.cloudflarestorage.com");
  assert.equal(config?.bucket, "social-agent");
  assert.equal(config?.region, "auto");
});

test("buildR2ObjectUrl uses public base url when provided", () => {
  const url = buildR2ObjectUrl(
    {
      endpoint: "https://account.r2.cloudflarestorage.com",
      bucket: "social-agent",
      publicBaseUrl: "https://media.example.com/assets/",
    },
    "images/2026/04/card name.png"
  );

  assert.equal(url, "https://media.example.com/assets/images/2026/04/card%20name.png");
});
