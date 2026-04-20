import { readFileSync } from "node:fs";

const DEFAULT_TWEET_CHAR_LIMIT = 280;
const DEFAULT_THREAD_CHUNK_LIMIT = 260;

export type BirdCredentialSource = {
  X_AUTH_TOKEN?: string | null;
  X_CT0?: string | null;
  authToken?: string | null;
  ct0?: string | null;
  cookieFile?: string | null;
  useInstalledBirdSession?: boolean | null;
  chromeProfile?: string | null;
  chromeProfileDir?: string | null;
  birdProfilePath?: string | null;
  firefoxProfile?: string | null;
  cookieSource?: unknown;
  threadLongPosts?: boolean | null;
  tweetCharLimit?: number | string | null;
  threadChunkLimit?: number | string | null;
  accessToken?: string | null;
  accessTokenSecret?: string | null;
};

export type BirdCredentials = {
  authToken: string | null;
  ct0: string | null;
  cookieFile: string | null;
  useInstalledBirdSession: boolean;
  chromeProfile: string | null;
  chromeProfileDir: string | null;
  firefoxProfile: string | null;
  cookieSource: string[];
  threadLongPosts: boolean;
  tweetCharLimit: number;
  threadChunkLimit: number;
};

export function buildBirdEnv(
  credentials: Pick<BirdCredentials, "authToken" | "ct0">,
  env: NodeJS.ProcessEnv = process.env
) {
  const nextEnv = { ...env };
  delete nextEnv.AUTH_TOKEN;
  delete nextEnv.CT0;
  delete nextEnv.X_AUTH_TOKEN;
  delete nextEnv.X_CT0;

  if (credentials.authToken && credentials.ct0) {
    nextEnv.AUTH_TOKEN = credentials.authToken;
    nextEnv.CT0 = credentials.ct0;
    nextEnv.X_AUTH_TOKEN = credentials.authToken;
    nextEnv.X_CT0 = credentials.ct0;
  }

  return nextEnv;
}

export function normalizeBirdUserHandle(handle?: string | null) {
  const trimmed = handle?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function buildBirdMentionCommandArgs(
  args: string[],
  handle?: string | null
) {
  if (args[0] !== "mentions") return args;
  if (args.includes("--user") || args.includes("-u")) return args;

  const userHandle = normalizeBirdUserHandle(handle);
  if (!userHandle) return args;

  return ["mentions", "--user", userHandle, ...args.slice(1)];
}

function readCredentialString(
  credentials: BirdCredentialSource,
  ...keys: Array<keyof BirdCredentialSource>
) {
  for (const key of keys) {
    const value = credentials[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readCredentialBoolean(
  credentials: BirdCredentialSource,
  key: keyof BirdCredentialSource,
  fallback: boolean
) {
  return typeof credentials[key] === "boolean"
    ? Boolean(credentials[key])
    : fallback;
}

function readCredentialNumber(
  credentials: BirdCredentialSource,
  key: keyof BirdCredentialSource,
  fallback: number
) {
  const value = credentials[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readCookieFile(
  filePath: string
): { authToken: string; ct0: string } | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const cookies: Array<{ name: string; value: string }> = Array.isArray(
      parsed
    )
      ? parsed
      : parsed?.cookies ?? [];
    const authToken = cookies.find((c) => c.name === "auth_token")?.value;
    const ct0 = cookies.find((c) => c.name === "ct0")?.value;
    if (authToken && ct0) return { authToken, ct0 };
    return null;
  } catch {
    return null;
  }
}

function readCredentialStringArray(
  credentials: BirdCredentialSource,
  key: keyof BirdCredentialSource
) {
  const value = credentials[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function resolveBirdCredentialsFromSource(
  credentials: BirdCredentialSource,
  env: NodeJS.ProcessEnv = process.env
): BirdCredentials {
  const useInstalledBirdSession = readCredentialBoolean(
    credentials,
    "useInstalledBirdSession",
    true
  );
  const explicitAuthToken = readCredentialString(
    credentials,
    "X_AUTH_TOKEN",
    "authToken",
    "accessToken"
  );
  const explicitCt0 = readCredentialString(
    credentials,
    "X_CT0",
    "ct0",
    "accessTokenSecret"
  );
  const cookieFile =
    readCredentialString(credentials, "cookieFile") ||
    env.BIRD_COOKIE_FILE ||
    null;

  const allowEnvAuthFallback =
    env.BIRD_FORCE_ENV_AUTH === "true" || !useInstalledBirdSession;

  let authToken =
    explicitAuthToken ||
    (allowEnvAuthFallback ? env.X_AUTH_TOKEN || env.AUTH_TOKEN || null : null);
  let ct0 =
    explicitCt0 ||
    (allowEnvAuthFallback ? env.X_CT0 || env.CT0 || null : null);

  if ((!authToken || !ct0) && cookieFile) {
    const fromFile = readCookieFile(cookieFile);
    if (fromFile) {
      authToken = authToken || fromFile.authToken;
      ct0 = ct0 || fromFile.ct0;
    }
  }

  return {
    authToken,
    ct0,
    cookieFile,
    useInstalledBirdSession,
    chromeProfile: readCredentialString(credentials, "chromeProfile"),
    chromeProfileDir:
      readCredentialString(credentials, "chromeProfileDir", "birdProfilePath") ||
      null,
    firefoxProfile: readCredentialString(credentials, "firefoxProfile"),
    cookieSource: readCredentialStringArray(credentials, "cookieSource"),
    threadLongPosts: readCredentialBoolean(credentials, "threadLongPosts", true),
    tweetCharLimit: readCredentialNumber(
      credentials,
      "tweetCharLimit",
      DEFAULT_TWEET_CHAR_LIMIT
    ),
    threadChunkLimit: readCredentialNumber(
      credentials,
      "threadChunkLimit",
      DEFAULT_THREAD_CHUNK_LIMIT
    ),
  };
}

export function classifyBirdError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("(186)") ||
    normalized.includes("too long") ||
    normalized.includes("exceeds")
  ) {
    return "validation_error" as const;
  }

  if (
    normalized.includes("duplicate") ||
    normalized.includes("already tweeted") ||
    normalized.includes("already exists")
  ) {
    return "duplicate" as const;
  }

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("cookie") ||
    normalized.includes("login")
  ) {
    return "auth_error" as const;
  }

  if (normalized.includes("rate limit")) {
    return "rate_limited" as const;
  }

  return "provider_error" as const;
}

function splitLongSegment(segment: string, limit: number): string[] {
  const words = segment.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (word.length <= limit) {
      current = word;
      continue;
    }

    let offset = 0;
    while (offset < word.length) {
      chunks.push(word.slice(offset, offset + limit));
      offset += limit;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitContentByLimit(content: string, limit: number): string[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > limit) {
      const pieces = splitLongSegment(paragraph, limit);
      for (const piece of pieces) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        chunks.push(piece);
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function splitBirdThreadContent(
  content: string,
  chunkLimit = DEFAULT_THREAD_CHUNK_LIMIT
) {
  const baseChunks = splitContentByLimit(content.trim(), chunkLimit);

  if (baseChunks.length <= 1) {
    return baseChunks;
  }

  const total = baseChunks.length;
  return baseChunks.map((chunk, index) => {
    const prefix = `${index + 1}/${total} `;
    const allowed = Math.max(1, chunkLimit - prefix.length);
    if (chunk.length <= allowed) {
      return `${prefix}${chunk}`;
    }
    return `${prefix}${chunk.slice(0, allowed).trimEnd()}`;
  });
}
