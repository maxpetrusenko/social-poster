import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

type SafeAddress = {
  address: string;
  family: 4 | 6;
};

export type SafeRemoteResponse = {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export async function safeFetchRemote(
  url: string,
  init: RequestInit = {},
  redirectsRemaining = MAX_REDIRECTS
): Promise<SafeRemoteResponse | null> {
  const resolved = await resolveSafeRemoteUrl(url);
  if (!resolved) return null;

  const response = await requestPinnedRemote(resolved.url, resolved.address, init);

  if (response.status >= 300 && response.status < 400) {
    if (redirectsRemaining <= 0) return null;
    const location = response.headers.get("location");
    if (!location) return null;

    const nextUrl = new URL(location, resolved.url);
    return safeFetchRemote(nextUrl.toString(), init, redirectsRemaining - 1);
  }

  return response;
}

export async function isSafeRemoteHttpUrl(value: string): Promise<boolean> {
  return Boolean(await resolveSafeRemoteUrl(value));
}

async function resolveSafeRemoteUrl(value: string): Promise<{ url: URL; address: SafeAddress } | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) return null;

  const directIpVersion = net.isIP(hostname);
  if (directIpVersion) {
    return isPublicIp(hostname)
      ? { url, address: { address: hostname, family: directIpVersion as 4 | 6 } }
      : null;
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: false });
    if (records.length === 0) return null;
    const publicRecords = records.filter((record) => isPublicIp(record.address));
    if (publicRecords.length !== records.length) return null;
    const record = publicRecords[0];
    return { url, address: { address: record.address, family: record.family as 4 | 6 } };
  } catch {
    return null;
  }
}

function requestPinnedRemote(
  url: URL,
  address: SafeAddress,
  init: RequestInit
): Promise<SafeRemoteResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const headers = headersToRecord(init.headers);
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: init.method || "GET",
        headers,
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options?.all) {
            callback(null, [{ address: address.address, family: address.family }]);
            return;
          }

          callback(null, address.address, address.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;

        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("Remote response is too large."));
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
            status: response.statusCode ?? 0,
            headers: {
              get(name: string) {
                const value = response.headers[name.toLowerCase()];
                if (Array.isArray(value)) return value.join(", ");
                return value ?? null;
              },
            },
            async text() {
              return body.toString("utf8");
            },
            async arrayBuffer() {
              return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
            },
          });
        });
      }
    );

    request.on("error", reject);

    if (init.signal) {
      if (init.signal.aborted) {
        request.destroy(new Error("Request aborted."));
        return;
      }
      init.signal.addEventListener("abort", () => request.destroy(new Error("Request aborted.")), { once: true });
    }

    request.end();
  });
}

function headersToRecord(headers: RequestInit["headers"]) {
  if (!headers) return undefined;
  return Object.fromEntries(new Headers(headers).entries());
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  );
}

function isPublicIp(address: string) {
  if (net.isIPv4(address)) return isPublicIpv4(address);
  if (net.isIPv6(address)) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;

  return true;
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);

  const firstGroup = parseInt(normalized.split(":")[0] || "0", 16);
  if (!Number.isFinite(firstGroup)) return false;

  if ((firstGroup & 0xfe00) === 0xfc00) return false;
  if ((firstGroup & 0xffc0) === 0xfe80) return false;
  if ((firstGroup & 0xff00) === 0xff00) return false;

  return true;
}
