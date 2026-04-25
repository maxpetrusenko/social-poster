import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { platforms } from "@/db/schema";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import {
  buildBirdEnv,
  resolveBirdCredentialsFromSource,
} from "@/lib/pipeline/bird-publisher-core";

const execFileAsync = promisify(execFile);
const BIRD_PACKAGE = "@steipete/bird";

type PlatformRow = typeof platforms.$inferSelect;

export type BirdSessionStatus = "ok" | "failed";

export type BirdSessionHealth = {
  status: BirdSessionStatus;
  checkedAt: string;
  source: "explicit_tokens" | "env_tokens" | "browser_session" | "unknown";
  message: string;
  error: string | null;
};

export type BirdSessionCheckResult = BirdSessionHealth & {
  platformId: string;
  platformName: string;
  workspaceId: string | null;
};

export type BirdSessionCheckSummary = {
  checked: number;
  ok: number;
  failed: number;
  results: BirdSessionCheckResult[];
};

let activeCheck: Promise<BirdSessionCheckSummary> | null = null;
let lastSummary: BirdSessionCheckSummary | null = null;
let lastStartedAt: Date | null = null;
let lastCompletedAt: Date | null = null;

export async function checkBirdPlatformSession(
  platform: PlatformRow
): Promise<BirdSessionCheckResult> {
  const checkedAt = new Date();
  const result = await runBirdSessionCheck(platform, checkedAt);

  await db
    .update(platforms)
    .set({
      config: {
        ...(platform.config ?? {}),
        birdSession: {
          status: result.status,
          checkedAt: result.checkedAt,
          source: result.source,
          message: result.message,
          error: result.error,
        } satisfies BirdSessionHealth,
      },
      updatedAt: new Date(),
    })
    .where(eq(platforms.id, platform.id));

  return result;
}

export async function checkBirdSessions(
  options: { workspaceId?: string } = {}
): Promise<BirdSessionCheckSummary> {
  if (activeCheck) return activeCheck;

  activeCheck = runBirdSessionChecks(options).finally(() => {
    activeCheck = null;
  });
  return activeCheck;
}

export function getBirdSessionCheckSnapshot() {
  return {
    running: Boolean(activeCheck),
    lastStartedAt: lastStartedAt?.toISOString() ?? null,
    lastCompletedAt: lastCompletedAt?.toISOString() ?? null,
    lastSummary,
  };
}

async function runBirdSessionChecks(options: { workspaceId?: string }) {
  lastStartedAt = new Date();
  const rows = await selectBirdPlatforms(options.workspaceId);
  const results: BirdSessionCheckResult[] = [];

  for (const platform of rows) {
    results.push(await checkBirdPlatformSession(platform));
  }

  const summary = {
    checked: results.length,
    ok: results.filter((item) => item.status === "ok").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };

  lastSummary = summary;
  lastCompletedAt = new Date();
  return summary;
}

async function selectBirdPlatforms(workspaceId?: string) {
  const baseFilters = [
    eq(platforms.provider, "bird"),
    eq(platforms.enabled, true),
    isNotNull(platforms.workspaceId),
  ];
  const filters = workspaceId
    ? [...baseFilters, eq(platforms.workspaceId, workspaceId)]
    : baseFilters;

  return db
    .select()
    .from(platforms)
    .where(and(...filters));
}

async function runBirdSessionCheck(
  platform: PlatformRow,
  checkedAt: Date
): Promise<BirdSessionCheckResult> {
  if (!["twitter", "x"].includes(platform.type)) {
    return result(platform, checkedAt, "failed", "unknown", "Bird session checks only support X connections.");
  }

  const runtime = buildBirdRuntime(platform);
  const commandArgs = [...runtime.args, "whoami"];
  const runner = process.env.BIRD_RUNNER || "npx";
  const runnerArgs =
    runner === "npx" ? ["-y", BIRD_PACKAGE, ...commandArgs] : commandArgs;

  try {
    await execFileAsync(runner, runnerArgs, {
      timeout: 45_000,
      env: runtime.env,
      maxBuffer: 8 * 1024 * 1024,
    });
    return result(
      platform,
      checkedAt,
      "ok",
      runtime.source,
      "Bird authenticated to X."
    );
  } catch (error) {
    return result(
      platform,
      checkedAt,
      "failed",
      runtime.source,
      normalizeBirdSessionError(error),
      normalizeBirdSessionError(error)
    );
  }
}

function buildBirdRuntime(platform: PlatformRow) {
  const stored = readStoredConnectionConfig(platform.config);
  const credentials = resolveBirdCredentialsFromSource(stored.credentials ?? {});
  const args: string[] = [];

  if (credentials.authToken && credentials.ct0) {
    args.push("--auth-token", credentials.authToken, "--ct0", credentials.ct0);
    return {
      args,
      env: buildBirdEnv(credentials, stripBirdAuthFromEnv()),
      source: "explicit_tokens" as const,
    };
  }

  for (const source of credentials.cookieSource) {
    args.push("--cookie-source", source);
  }

  if (credentials.chromeProfileDir) {
    args.push("--chrome-profile-dir", credentials.chromeProfileDir);
  } else if (credentials.chromeProfile) {
    args.push("--chrome-profile", credentials.chromeProfile);
  }

  if (credentials.firefoxProfile) {
    args.push("--firefox-profile", credentials.firefoxProfile);
  }

  const envAuth = buildBirdAuthFromEnv();
  if (args.length === 0 && envAuth) return envAuth;

  return {
    args,
    env: stripBirdAuthFromEnv(),
    source: "browser_session" as const,
  };
}

function buildBirdAuthFromEnv() {
  const authToken = process.env.X_AUTH_TOKEN || process.env.AUTH_TOKEN;
  const ct0 = process.env.X_CT0 || process.env.CT0;

  if (!authToken || !ct0) return null;

  return {
    args: ["--auth-token", authToken, "--ct0", ct0],
    env: process.env,
    source: "env_tokens" as const,
  };
}

function stripBirdAuthFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const nextEnv = { ...env };
  delete nextEnv.AUTH_TOKEN;
  delete nextEnv.X_AUTH_TOKEN;
  delete nextEnv.CT0;
  delete nextEnv.X_CT0;
  return nextEnv;
}

function result(
  platform: PlatformRow,
  checkedAt: Date,
  status: BirdSessionStatus,
  source: BirdSessionHealth["source"],
  message: string,
  error: string | null = null
): BirdSessionCheckResult {
  return {
    platformId: platform.id,
    platformName: platform.name,
    workspaceId: platform.workspaceId,
    status,
    checkedAt: checkedAt.toISOString(),
    source,
    message,
    error,
  };
}

function normalizeBirdSessionError(error: unknown) {
  const stdout =
    error && typeof error === "object" && "stdout" in error
      ? String(error.stdout || "")
      : "";
  const stderr =
    error && typeof error === "object" && "stderr" in error
      ? String(error.stderr || "")
      : "";
  const message = [
    stdout,
    stderr,
    error instanceof Error ? error.message : String(error),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  const normalized = message.toLowerCase();

  if (
    normalized.includes("missing required credentials") ||
    normalized.includes("missing auth_token") ||
    normalized.includes("missing ct0")
  ) {
    return "Bird could not find X browser cookies. Log into x.com in the configured browser, then check the session again.";
  }

  if (
    normalized.includes("could not authenticate you") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401")
  ) {
    return "X rejected this Bird session. Log back into x.com or update auth_token and ct0, then check again.";
  }

  if (normalized.includes("could not determine current user")) {
    return "Bird reached X but could not infer the account. Keep the X handle set on this connection.";
  }

  return message || "Bird session check failed.";
}
