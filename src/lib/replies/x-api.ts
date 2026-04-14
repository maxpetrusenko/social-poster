import crypto from "node:crypto";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import { platforms } from "@/db/schema";

type PlatformRow = typeof platforms.$inferSelect;

type XApiCreateTweetResponse = {
  data?: {
    id?: string;
    text?: string;
  };
  errors?: Array<{ message?: string; detail?: string }>;
};

type ResolvedXCredentials =
  | {
      auth: "oauth1";
      apiKey: string;
      apiSecret: string;
      accessToken: string;
      accessTokenSecret: string;
    }
  | {
      auth: "bearer";
      token: string;
    };

function getCredentials(platform: Pick<PlatformRow, "config">): ResolvedXCredentials {
  const stored = readStoredConnectionConfig(platform.config);
  const credentials = stored.credentials ?? {};

  const apiKey = readString(credentials.apiKey);
  const apiSecret = readString(credentials.apiSecret);
  const accessToken = readString(credentials.accessToken);
  const accessTokenSecret = readString(credentials.accessTokenSecret);
  const bearerToken = readString(credentials.bearerToken);

  if (apiKey && apiSecret && accessToken && accessTokenSecret) {
    return {
      auth: "oauth1",
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret,
    };
  }

  if (accessToken) {
    return {
      auth: "bearer",
      token: accessToken,
    };
  }

  if (bearerToken) {
    return {
      auth: "bearer",
      token: bearerToken,
    };
  }

  throw new Error("Missing X API credentials for direct reply publishing");
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractTweetId(tweetUrl: string) {
  const match = tweetUrl.match(/status\/(\d+)/);
  if (!match) {
    throw new Error(`Could not extract tweet ID from ${tweetUrl}`);
  }

  return match[1];
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function createOauthHeader(
  method: string,
  url: string,
  credentials: Extract<ResolvedXCredentials, { auth: "oauth1" }>
) {
  const oauthParams = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const parameterString = Object.entries(oauthParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");

  const signatureBaseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join("&");

  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const oauthSignature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBaseString)
    .digest("base64");

  return `OAuth ${Object.entries({
    ...oauthParams,
    oauth_signature: oauthSignature,
  })
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

export async function sendXApiReply(
  platform: Pick<PlatformRow, "config" | "handle">,
  tweetUrl: string,
  text: string
): Promise<string> {
  const credentials = getCredentials(platform);
  const inReplyToTweetId = extractTweetId(tweetUrl);
  const endpoint = "https://api.x.com/2/tweets";

  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (credentials.auth === "oauth1") {
    headers.set("Authorization", createOauthHeader("POST", endpoint, credentials));
  } else {
    headers.set("Authorization", `Bearer ${credentials.token}`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      reply: {
        in_reply_to_tweet_id: inReplyToTweetId,
      },
    }),
  });

  const body = (await response.json().catch(() => ({}))) as XApiCreateTweetResponse;

  if (!response.ok) {
    const message =
      body.errors?.map((item) => item.detail || item.message).filter(Boolean).join("; ") ||
      `X API reply failed with status ${response.status}`;
    throw new Error(message);
  }

  const replyId = body.data?.id;
  if (!replyId) {
    throw new Error("X API reply succeeded but no post ID was returned");
  }

  const handle = platform.handle?.replace(/^@/, "") || "i";
  return `https://x.com/${handle}/status/${replyId}`;
}
