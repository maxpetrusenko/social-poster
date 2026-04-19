export type R2Config = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

export type CloudflareR2ApiConfig = {
  accountId: string;
  bucket: string;
  apiBaseUrl: string;
  publicBaseUrl: string | null;
  auth:
    | { type: "bearer"; token: string }
    | { type: "global"; email: string; key: string };
};

type Env = Record<string, string | undefined>;

function pickEnv(env: Env, keys: string[]): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function pickPublicBaseUrl(env: Env): string | null {
  return normalizeBaseUrl(
    pickEnv(env, [
      "CLOUDFLARE_R2_PUBLIC_BASE_URL",
      "CLOUDFLARE_R2_PUBLIC_URL",
      "CLOUDFLARE_PUBLIC_URL",
      "R2_PUBLIC_BASE_URL",
      "R2_PUBLIC_URL",
      "S3_CUSTOM_DOMAIN",
      "MEDIA_PUBLIC_BASE_URL",
    ])
  );
}

function pickBucket(env: Env): string | null {
  return pickEnv(env, [
    "CLOUDFLARE_R2_BUCKET",
    "CLOUDFLARE_BUCKET",
    "R2_BUCKET",
    "S3_BUCKET",
    "S3_BUCKET_NAME",
  ]);
}

function normalizeBaseUrl(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export function splitR2EndpointAndBucket(
  endpointInput: string,
  explicitBucket?: string | null
): { endpoint: string; bucket: string | null } | null {
  try {
    const url = new URL(endpointInput);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const bucket = explicitBucket?.trim() || pathParts[0] || null;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return {
      endpoint: url.toString().replace(/\/+$/, ""),
      bucket,
    };
  } catch {
    return null;
  }
}

export function resolveR2Config(env: Env = process.env): R2Config | null {
  const accountId = pickEnv(env, ["ACC_ID_CLOUDFLARE", "CLOUDFLARE_ACCOUNT_ID"]);
  const endpointInput =
    pickEnv(env, [
      "CLOUDFLARE_ENDPOINT",
      "CLOUDFLARE_R2_ENDPOINT",
      "R2_ENDPOINT",
      "S3_ENDPOINT_URL",
      "AWS_ENDPOINT_URL",
    ]) ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

  if (!endpointInput) return null;

  const explicitBucket = pickBucket(env);
  const endpoint = splitR2EndpointAndBucket(endpointInput, explicitBucket);
  if (!endpoint?.bucket) return null;

  const accessKeyId = pickEnv(env, [
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
    "S3_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
  ]);
  const secretAccessKey = pickEnv(env, [
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "S3_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  ]);

  if (!accessKeyId || !secretAccessKey) return null;

  return {
    endpoint: endpoint.endpoint,
    bucket: endpoint.bucket,
    region: pickEnv(env, ["CLOUDFLARE_R2_REGION", "R2_REGION", "S3_REGION_NAME", "AWS_REGION"]) ?? "auto",
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: pickPublicBaseUrl(env),
  };
}

export function resolveCloudflareR2ApiConfig(env: Env = process.env): CloudflareR2ApiConfig | null {
  const accountId = pickEnv(env, [
    "ACC_ID_CLOUDFLARE",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFARE_ACCOUNT_ID",
    "CLOUDFARE_ACCOUNT",
  ]);
  const bucket = pickBucket(env);
  if (!accountId || !bucket) return null;

  const globalApiKey = pickEnv(env, [
    "CLOUDFLARE_API_KEY_GLOBAL",
    "CLOUDFARE_API_KEY_GLOBAL",
    "CLOUDFLARE_GLOBAL_API_KEY",
    "CLOUDFARE_GLOBAL_API_KEY",
  ]);
  const email = pickEnv(env, ["CLOUDFLARE_EMAIL", "CLOUDFARE_EMAIL", "AUTH_EMAIL"]);
  if (globalApiKey && email) {
    return {
      accountId,
      bucket,
      apiBaseUrl: pickEnv(env, ["CLOUDFLARE_API_BASE_URL", "CLOUDFARE_API_BASE_URL"]) ??
        "https://api.cloudflare.com/client/v4",
      publicBaseUrl: pickPublicBaseUrl(env),
      auth: { type: "global", email, key: globalApiKey },
    };
  }

  const token = pickEnv(env, [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFARE_API_TOKEN",
    "CLOUDFLARE_R2_API_TOKEN",
    "CLOUDFARE_R2_API_TOKEN",
    "CLOUDFLARE_USER_TOKEN",
    "CLOUDFARE_USER_TOKEN",
  ]);
  if (!token) return null;

  return {
    accountId,
    bucket,
    apiBaseUrl: pickEnv(env, ["CLOUDFLARE_API_BASE_URL", "CLOUDFARE_API_BASE_URL"]) ??
      "https://api.cloudflare.com/client/v4",
    publicBaseUrl: pickPublicBaseUrl(env),
    auth: { type: "bearer", token },
  };
}

export function buildR2ObjectUrl(
  config: Pick<R2Config, "endpoint" | "bucket" | "publicBaseUrl">,
  key: string
) {
  const base = normalizeBaseUrl(config.publicBaseUrl ?? `${config.endpoint}/${config.bucket}`);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encodedKey}`;
}
