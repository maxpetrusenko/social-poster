import assert from "node:assert/strict";
import test from "node:test";

import {
  buildR2ObjectUrl,
  resolveCloudflareR2ApiConfig,
  resolveR2Config,
  splitR2EndpointAndBucket,
} from "./r2-config.ts";

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

test("resolveR2Config accepts S3-compatible env names from R2 dashboards", () => {
  const config = resolveR2Config({
    S3_ENDPOINT_URL: "https://account.r2.cloudflarestorage.com",
    S3_BUCKET_NAME: "social-agent",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_REGION_NAME: "auto",
    S3_CUSTOM_DOMAIN: "https://media.example.com/social-agent",
  });

  assert.equal(config?.endpoint, "https://account.r2.cloudflarestorage.com");
  assert.equal(config?.bucket, "social-agent");
  assert.equal(config?.accessKeyId, "key");
  assert.equal(config?.secretAccessKey, "secret");
  assert.equal(config?.publicBaseUrl, "https://media.example.com/social-agent");
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

test("resolveCloudflareR2ApiConfig prefers global key auth when available", () => {
  const config = resolveCloudflareR2ApiConfig({
    ACC_ID_CLOUDFLARE: "account",
    R2_BUCKET: "social-agent",
    CLOUDFARE_API_KEY_GLOBAL: "global-key",
    AUTH_EMAIL: "max@example.com",
  });

  assert.equal(config?.accountId, "account");
  assert.equal(config?.bucket, "social-agent");
  assert.equal(config?.auth.type, "global");
});
