import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPublicAppUrlFromEnv } from "@/lib/app-url";
import {
  buildR2ObjectUrl,
  resolveCloudflareR2ApiConfig,
  resolveR2Config,
  type CloudflareR2ApiConfig,
  type R2Config,
} from "@/lib/storage/r2-config";
import { isSafeRemoteHttpUrl, safeFetchRemote } from "@/lib/safe-remote-fetch";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const SCHEDULE_MEDIA_DIR = path.resolve(process.cwd(), "data", "schedule-media");

type JsonRecord = Record<string, unknown>;

type StoredScheduleMedia = {
  url: string;
  key: string;
};

type HydrateOptions = {
  workspaceId: string;
  scheduleId?: string | null;
  strict?: boolean;
};

type FetchedScheduleMedia = {
  bytes: Buffer;
  contentType: string;
  sourceName: string;
};

type ProbeResult = {
  ok: boolean;
  sourceUrl: string;
};

let cachedClient: { key: string; client: S3Client } | null = null;

export async function hydrateScheduleConfigMedia(
  value: unknown,
  options: HydrateOptions
): Promise<Record<string, unknown> | null> {
  if (!isRecord(value)) return null;

  const next: JsonRecord = JSON.parse(JSON.stringify(value));

  if (typeof next.mediaUrl === "string") {
    next.mediaUrl = await hydrateScheduleMediaValue(next.mediaUrl, options);
  }

  if (isRecord(next.mediaUrlByPlatform)) {
    next.mediaUrlByPlatform = await hydrateStringRecord(
      next.mediaUrlByPlatform,
      options
    );
  }

  if (isRecord(next.mediaUrlVariantsByPlatform)) {
    next.mediaUrlVariantsByPlatform = await hydrateStringArrayRecord(
      next.mediaUrlVariantsByPlatform,
      options
    );
  }

  return next;
}

export async function probeScheduleMediaUrl(
  value: string
): Promise<ProbeResult> {
  const sourceUrl = normalizeScheduleMediaSourceUrl(value);
  if (!sourceUrl) {
    return { ok: false, sourceUrl: value };
  }

  const local = await readAppHostedMedia(sourceUrl);
  if (local) {
    return { ok: true, sourceUrl };
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, sourceUrl };
  }

  if (!(await isSafeRemoteHttpUrl(sourceUrl))) {
    return { ok: false, sourceUrl };
  }

  const response = await safeFetchRemote(sourceUrl, {
    method: "HEAD",
    headers: {
      "User-Agent": "social-poster/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (response?.ok) {
    return { ok: true, sourceUrl };
  }

  const fallback = await safeFetchRemote(sourceUrl, {
    headers: {
      "User-Agent": "social-poster/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);

  return {
    ok: Boolean(fallback?.ok),
    sourceUrl,
  };
}

export function isDurableScheduleMediaUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("/api/schedule-media/")) return true;

  try {
    const url = new URL(trimmed);
    if (url.pathname.startsWith("/api/schedule-media/")) return true;

    const pathname = url.pathname.toLowerCase();
    return pathname.includes("/schedules/") && pathname.includes("/media/");
  } catch {
    return false;
  }
}

export function normalizeScheduleMediaSourceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const relativeWrapped = unwrapOgImageSource(trimmed);
  if (relativeWrapped) return relativeWrapped;

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const wrapped = unwrapOgImageSource(parsed.pathname + parsed.search);
    if (wrapped) return wrapped;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function readScheduleMedia(filename: string) {
  if (!/^[\w-]+\.(png|jpe?g|webp|gif)$/i.test(filename)) return null;
  const filePath = path.join(SCHEDULE_MEDIA_DIR, filename);
  if (!filePath.startsWith(SCHEDULE_MEDIA_DIR) || !existsSync(filePath)) return null;

  const bytes = await readFile(filePath);
  return {
    bytes,
    contentType: contentTypeForName(filename),
  };
}

async function hydrateStringRecord(
  value: Record<string, unknown>,
  options: HydrateOptions
) {
  const output: Record<string, unknown> = { ...value };
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") continue;
    output[key] = await hydrateScheduleMediaValue(item, options);
  }
  return output;
}

async function hydrateStringArrayRecord(
  value: Record<string, unknown>,
  options: HydrateOptions
) {
  const output: Record<string, unknown> = { ...value };

  for (const [key, item] of Object.entries(value)) {
    if (!Array.isArray(item)) continue;

    const nextItems = await Promise.all(
      item.map(async (entry) => {
        if (typeof entry !== "string") return entry;
        return hydrateScheduleMediaValue(entry, options);
      })
    );
    output[key] = nextItems;
  }

  return output;
}

async function hydrateScheduleMediaValue(
  value: string,
  options: HydrateOptions
) {
  if (isDurableScheduleMediaUrl(value)) {
    return value;
  }

  const fetched = await fetchScheduleMedia(value);
  if (!fetched) {
    if (options.strict) {
      const source = normalizeScheduleMediaSourceUrl(value) ?? value;
      throw new Error(`Schedule media could not be snapshotted: ${source}`);
    }
    return value;
  }

  const stored = await storeScheduleMediaAsset(fetched, options);
  return stored.url;
}

async function fetchScheduleMedia(value: string): Promise<FetchedScheduleMedia | null> {
  const sourceUrl = normalizeScheduleMediaSourceUrl(value);
  if (!sourceUrl) return null;

  const local = await readAppHostedMedia(sourceUrl);
  if (local) return local;

  const resolvedUrl = resolveRelativeUrl(sourceUrl);
  if (!resolvedUrl) return null;

  if (!/^https?:\/\//i.test(resolvedUrl)) return null;
  if (!(await isSafeRemoteHttpUrl(resolvedUrl))) return null;

  const response = await safeFetchRemote(resolvedUrl, {
    headers: {
      "User-Agent": "social-poster/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!response?.ok) return null;

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_MEDIA_BYTES) return null;

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) return null;

  return {
    bytes: Buffer.from(arrayBuffer),
    contentType,
    sourceName: fileNameFromUrl(resolvedUrl),
  };
}

async function readAppHostedMedia(sourceUrl: string): Promise<FetchedScheduleMedia | null> {
  const parsed = parseSameOriginAppUrl(sourceUrl);
  const pathname = parsed?.pathname ?? sourceUrl;
  const search = parsed?.search ?? "";

  if (pathname.startsWith("/campaigns/")) {
    const filePath = path.join(process.cwd(), "public", pathname.replace(/^\/+/, ""));
    if (!filePath.startsWith(path.join(process.cwd(), "public")) || !existsSync(filePath)) {
      return null;
    }

    const bytes = await readFile(filePath);
    return {
      bytes,
      contentType: contentTypeForName(filePath),
      sourceName: path.basename(filePath),
    };
  }

  if (pathname.startsWith("/api/campaign-media/")) {
    const filename = pathname.split("/").pop();
    if (!filename) return null;
    const filePath = path.join(process.cwd(), "data", "campaign-media", filename);
    if (!existsSync(filePath)) return null;
    const bytes = await readFile(filePath);
    return {
      bytes,
      contentType: contentTypeForName(filePath),
      sourceName: filename,
    };
  }

  if (pathname.startsWith("/api/schedule-media/")) {
    const filename = pathname.split("/").pop();
    if (!filename) return null;
    const filePath = path.join(SCHEDULE_MEDIA_DIR, filename);
    if (!existsSync(filePath)) return null;
    const bytes = await readFile(filePath);
    return {
      bytes,
      contentType: contentTypeForName(filePath),
      sourceName: filename,
    };
  }

  if (pathname === "/api/og-image") {
    const wrapped = unwrapOgImageSource(`${pathname}${search}`);
    if (!wrapped) return null;
    return fetchScheduleMedia(wrapped);
  }

  return null;
}

async function storeScheduleMediaAsset(
  input: FetchedScheduleMedia,
  options: HydrateOptions
): Promise<StoredScheduleMedia> {
  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
  const key = buildScheduleMediaKey({
    workspaceId: options.workspaceId,
    scheduleId: options.scheduleId ?? null,
    bytes,
    sourceName: input.sourceName,
    contentType: input.contentType,
  });

  const apiConfig = resolveCloudflareR2ApiConfig();
  const r2Config = resolveR2Config();

  if (apiConfig && process.env.R2_UPLOAD_PROVIDER !== "s3") {
    await uploadWithCloudflareApi(apiConfig, {
      key,
      bytes,
      contentType: input.contentType,
    });
    return {
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

  if (r2Config) {
    await uploadWithS3(r2Config, {
      key,
      bytes,
      contentType: input.contentType,
    });
    return {
      key,
      url: buildR2ObjectUrl(r2Config, key),
    };
  }

  ensureLocalDir();
  const filename = `${crypto.randomUUID()}.${extensionForContentType(input.contentType)}`;
  await writeFile(path.join(SCHEDULE_MEDIA_DIR, filename), bytes);
  return {
    key: filename,
    url: `${getPublicAppUrlFromEnv()}/api/schedule-media/${filename}`,
  };
}

function buildScheduleMediaKey(input: {
  workspaceId: string;
  scheduleId: string | null;
  bytes: Buffer;
  sourceName: string;
  contentType: string;
}) {
  const year = new Date().getUTCFullYear();
  const month = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const hash = crypto.createHash("sha256").update(input.bytes).digest("hex").slice(0, 24);
  const sourceStem = sanitizeKeyPart(input.sourceName);
  const schedulePart = sanitizeKeyPart(input.scheduleId ?? "shared");
  return `workspaces/${sanitizeKeyPart(input.workspaceId)}/schedules/${schedulePart}/media/${year}/${month}/${sourceStem}-${hash}.${extensionForContentType(input.contentType)}`;
}

function getClient(config: R2Config) {
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

async function uploadWithS3(
  config: R2Config,
  input: { key: string; bytes: Buffer; contentType: string }
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

async function uploadWithCloudflareApi(
  config: CloudflareR2ApiConfig,
  input: { key: string; bytes: Buffer; contentType: string }
) {
  const headers = new Headers({
    "Content-Type": input.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  if (config.auth.type === "global") {
    headers.set("X-Auth-Email", config.auth.email);
    headers.set("X-Auth-Key", config.auth.key);
  } else {
    headers.set("Authorization", `Bearer ${config.auth.token}`);
  }

  const body = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;
  const url = `${config.apiBaseUrl.replace(/\/+$/, "")}/accounts/${encodeURIComponent(
    config.accountId
  )}/r2/buckets/${encodeURIComponent(config.bucket)}/objects/${encodeKey(
    input.key
  )}`;

  const response = await fetch(url, {
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

function encodeKey(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function resolveRelativeUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("/")) return null;

  try {
    return new URL(value, getPublicAppUrlFromEnv()).toString();
  } catch {
    return null;
  }
}

function parseSameOriginAppUrl(value: string) {
  try {
    const parsed = new URL(value);
    const appUrl = new URL(getPublicAppUrlFromEnv());
    if (parsed.origin !== appUrl.origin) return null;
    return parsed;
  } catch {
    return null;
  }
}

function unwrapOgImageSource(value: string) {
  const parsed = value.startsWith("/")
    ? new URL(value, getPublicAppUrlFromEnv())
    : (() => {
        try {
          return new URL(value);
        } catch {
          return null;
        }
      })();

  if (!parsed || parsed.pathname !== "/api/og-image") return null;
  const wrapped = parsed.searchParams.get("url")?.trim();
  return wrapped || null;
}

function fileNameFromUrl(value: string) {
  try {
    const parsed = new URL(value);
    return path.basename(parsed.pathname) || "media";
  } catch {
    return "media";
  }
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

function contentTypeForName(value: string) {
  const lower = value.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

function sanitizeKeyPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "media";
}

function ensureLocalDir() {
  if (!existsSync(SCHEDULE_MEDIA_DIR)) {
    mkdirSync(SCHEDULE_MEDIA_DIR, { recursive: true });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
