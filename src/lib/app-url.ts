const DEFAULT_APP_URL = "http://localhost:3000";

export function getAppUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const coolifyUrl = env.COOLIFY_URL?.split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return (
    env.APP_URL?.trim() ||
    coolifyUrl ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    DEFAULT_APP_URL
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
      (isLocalHost(forwardedHost)
        ? "http"
        : new URL(input.url ?? getAppUrlFromEnv()).protocol.replace(/:$/, ""));

    return `${forwardedProto}://${forwardedHost}`;
  }

  if (input.url) {
    return new URL(input.url).origin;
  }

  return getAppUrlFromEnv();
}

function isLocalHost(host: string) {
  const hostname = host.split(":")[0]?.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}
