export type R2Config = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

type Env = Record<string, string | undefined>;

function pickEnv(env: Env, keys: string[]): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
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
    pickEnv(env, ["CLOUDFLARE_ENDPOINT", "CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT"]) ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

  if (!endpointInput) return null;

  const explicitBucket = pickEnv(env, [
    "CLOUDFLARE_R2_BUCKET",
    "CLOUDFLARE_BUCKET",
    "R2_BUCKET",
    "S3_BUCKET",
  ]);
  const endpoint = splitR2EndpointAndBucket(endpointInput, explicitBucket);
  if (!endpoint?.bucket) return null;

  const accessKeyId = pickEnv(env, [
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
  ]);
  const secretAccessKey = pickEnv(env, [
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  ]);

  if (!accessKeyId || !secretAccessKey) return null;

  return {
    endpoint: endpoint.endpoint,
    bucket: endpoint.bucket,
    region: pickEnv(env, ["CLOUDFLARE_R2_REGION", "R2_REGION", "AWS_REGION"]) ?? "auto",
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: normalizeBaseUrl(
      pickEnv(env, [
        "CLOUDFLARE_R2_PUBLIC_BASE_URL",
        "CLOUDFLARE_R2_PUBLIC_URL",
        "CLOUDFLARE_PUBLIC_URL",
        "R2_PUBLIC_BASE_URL",
        "R2_PUBLIC_URL",
        "MEDIA_PUBLIC_BASE_URL",
      ])
    ),
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
