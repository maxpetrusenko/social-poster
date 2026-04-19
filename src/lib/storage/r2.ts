import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import path from "node:path";

import {
  buildR2ObjectUrl,
  resolveCloudflareR2ApiConfig,
  resolveR2Config,
  type CloudflareR2ApiConfig,
  type R2Config,
} from "./r2-config";

export type StoredImageAsset = {
  bucket: string;
  key: string;
  url: string;
};

type UploadImageAssetInput = {
  bytes: Buffer | Uint8Array;
  contentType: string;
  key?: string;
  keyPrefix?: string;
  sourceName?: string;
};

let cachedClient: { key: string; client: S3Client } | null = null;

function getClient(config: R2Config): S3Client {
  const cacheKey = `${config.endpoint}:${config.region}:${config.accessKeyId}`;
  if (cachedClient?.key === cacheKey) return cachedClient.client;

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClient = { key: cacheKey, client };
  return client;
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function applyCloudflareAuth(headers: Headers, config: CloudflareR2ApiConfig) {
  if (config.auth.type === "global") {
    headers.set("X-Auth-Email", config.auth.email);
    headers.set("X-Auth-Key", config.auth.key);
    return;
  }
  headers.set("Authorization", `Bearer ${config.auth.token}`);
}

function cloudflareApiObjectUrl(config: CloudflareR2ApiConfig, key: string): string {
  return `${config.apiBaseUrl.replace(/\/+$/, "")}/accounts/${encodeURIComponent(
    config.accountId
  )}/r2/buckets/${encodeURIComponent(config.bucket)}/objects/${encodeObjectKey(key)}`;
}

async function uploadWithCloudflareApi(
  config: CloudflareR2ApiConfig,
  input: { bytes: Buffer; contentType: string; key: string }
) {
  const body = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;
  const headers = new Headers({
    "Content-Type": input.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  applyCloudflareAuth(headers, config);

  const response = await fetch(cloudflareApiObjectUrl(config, input.key), {
    method: "PUT",
    headers,
    body,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Cloudflare R2 API upload failed: ${response.status} ${message.slice(0, 200)}`
    );
  }
}

async function uploadWithS3(
  config: R2Config,
  input: { bytes: Buffer; contentType: string; key: string }
) {
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

function sanitizeKeyPart(value: string): string {
  const parsed = path.parse(value);
  return (parsed.name || "image")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
}

export function buildImageAssetKey(input: {
  bytes: Buffer | Uint8Array;
  contentType: string;
  keyPrefix?: string;
  sourceName?: string;
  date?: Date;
}): string {
  const date = input.date ?? new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hash = crypto.createHash("sha256").update(input.bytes).digest("hex").slice(0, 24);
  const source = input.sourceName ? `${sanitizeKeyPart(input.sourceName)}-` : "";
  const prefix = (input.keyPrefix ?? "images").replace(/^\/+|\/+$/g, "") || "images";
  return `${prefix}/${year}/${month}/${source}${hash}.${extensionForContentType(input.contentType)}`;
}

export async function uploadImageAsset(input: UploadImageAssetInput): Promise<StoredImageAsset | null> {
  const config = resolveR2Config();
  const apiConfig = resolveCloudflareR2ApiConfig();
  if (!config && !apiConfig) return null;

  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
  const key =
    input.key ??
    buildImageAssetKey({
      bytes,
      contentType: input.contentType,
      keyPrefix: input.keyPrefix,
      sourceName: input.sourceName,
    });

  if (apiConfig && process.env.R2_UPLOAD_PROVIDER !== "s3") {
    await uploadWithCloudflareApi(apiConfig, { bytes, contentType: input.contentType, key });
    return {
      bucket: apiConfig.bucket,
      key,
      url: buildR2ObjectUrl(
        {
          endpoint: `https://${apiConfig.accountId}.r2.cloudflarestorage.com`,
          bucket: apiConfig.bucket,
          publicBaseUrl: apiConfig.publicBaseUrl,
        },
        key
      ),
    };
  }

  if (!config) return null;
  await uploadWithS3(config, { bytes, contentType: input.contentType, key });

  return {
    bucket: config.bucket,
    key,
    url: buildR2ObjectUrl(config, key),
  };
}
