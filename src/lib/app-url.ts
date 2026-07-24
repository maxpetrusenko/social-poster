import {
  APP_ORIGIN,
  getAppHostKind,
} from "@/lib/site-domains";

const DEFAULT_APP_URL = "http://localhost:3000";

type ParsedAppOrigin = {
  hostname: string;
  origin: string;
};

function parseAppOrigins(value?: string | null): ParsedAppOrigin[] {
  return (value ?? "")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .flatMap((candidate) => {
      try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return [];
        }

        return [
          {
            hostname: url.hostname.toLowerCase(),
            origin: url.origin,
          },
        ];
      } catch {
        return [];
      }
    });
}

export function normalizeAppUrl(value?: string | null): string | null {
  const origins = parseAppOrigins(value);
  return (
    origins.find((url) => getAppHostKind(url.hostname) === "canonical")
      ?.origin ??
    origins.find((url) => getAppHostKind(url.hostname) === "legacy")?.origin ??
    origins[0]?.origin ??
    null
  );
}

export function getAppUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    normalizeAppUrl(env.APP_URL) ||
    normalizeAppUrl(env.COOLIFY_URL) ||
    normalizeAppUrl(env.NEXT_PUBLIC_APP_URL) ||
    DEFAULT_APP_URL
  );
}

export function getPublicAppUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    normalizeAppUrl(env.PUBLIC_APP_URL) ||
    normalizeAppUrl(env.APP_PUBLIC_URL) ||
    normalizeAppUrl(env.APP_URL) ||
    normalizeAppUrl(env.COOLIFY_URL) ||
    normalizeAppUrl(env.NEXT_PUBLIC_APP_URL) ||
    APP_ORIGIN
  );
}

export function getRequestAppUrl(input: {
  headers: Headers;
  url?: string;
}): string {
  const forwardedHost =
    input.headers.get("x-forwarded-host") ?? input.headers.get("host");

  if (forwardedHost) {
    const forwardedProto =
      input.headers.get("x-forwarded-proto") ??
      input.headers.get("x-forwarded-protocol") ??
      requestUrlProtocol(input.url, forwardedHost) ??
      (isLocalHost(forwardedHost)
        ? "http"
        : "https");

    return `${forwardedProto}://${forwardedHost}`;
  }

  if (input.url) {
    return new URL(input.url).origin;
  }

  return getAppUrlFromEnv();
}

function requestUrlProtocol(url: string | undefined, host: string) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.host !== host) return null;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.protocol.slice(0, -1);
  } catch {
    return null;
  }
}

function isLocalHost(host: string) {
  const hostname = host.split(":")[0]?.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}
