const DEFAULT_APP_URL = "http://localhost:3000";

export function getAppUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.APP_URL?.trim() ||
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
      new URL(input.url ?? getAppUrlFromEnv()).protocol.replace(/:$/, "");

    return `${forwardedProto}://${forwardedHost}`;
  }

  if (input.url) {
    return new URL(input.url).origin;
  }

  return getAppUrlFromEnv();
}
