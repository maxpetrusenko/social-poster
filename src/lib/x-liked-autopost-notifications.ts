import "server-only";

import type { PublishClassification } from "@/lib/pipeline/publisher";

export type XLikedAutopostOperationalFailure = {
  platform: string;
  classification: PublishClassification | "writer_unavailable" | "storage_error";
  error: string;
};

export type XLikedAutopostTelegramResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

const OPERATIONAL_CLASSIFICATIONS = new Set<string>([
  "auth_error",
  "rate_limited",
  "provider_error",
  "network_error",
  "writer_unavailable",
  "storage_error",
]);

function appBaseUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://social.maxpetrusenko.com"
  ).replace(/\/+$/, "");
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

export function isXLikedAutopostOperationalFailure(
  failure: XLikedAutopostOperationalFailure
) {
  return OPERATIONAL_CLASSIFICATIONS.has(failure.classification);
}

export function buildXLikedAutopostFailureMessage(input: {
  runId: string;
  workspaceId: string;
  sourceUrl: string;
  failures: XLikedAutopostOperationalFailure[];
  retryCount?: number;
  nextRetryAt?: Date | null;
}) {
  const dashboardUrl = `${appBaseUrl()}/dashboard/pipeline?runId=${encodeURIComponent(input.runId)}`;
  const failureLines = input.failures.map((failure) =>
    [
      `platform=${failure.platform}`,
      `class=${failure.classification}`,
      `error=${truncate(failure.error, 260)}`,
    ].join(" ")
  );

  return [
    "Social Poster liked-post failure",
    `run_id: ${input.runId}`,
    `workspace: ${input.workspaceId}`,
    `source: ${input.sourceUrl}`,
    `retry_count: ${input.retryCount ?? 0}`,
    `next_retry: ${input.nextRetryAt?.toISOString() ?? "none"}`,
    `dashboard: ${dashboardUrl}`,
    "",
    ...failureLines,
  ].join("\n");
}

export async function notifyXLikedAutopostOperationalFailure(input: {
  runId: string;
  workspaceId: string;
  sourceUrl: string;
  failures: XLikedAutopostOperationalFailure[];
  retryCount?: number;
  nextRetryAt?: Date | null;
  fetchImpl?: typeof fetch;
}): Promise<XLikedAutopostTelegramResult> {
  const failures = input.failures.filter(isXLikedAutopostOperationalFailure);
  if (failures.length === 0) {
    return { status: "skipped", reason: "no operational failures" };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    return { status: "skipped", reason: "telegram not configured" };
  }

  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildXLikedAutopostFailureMessage({
        ...input,
        failures,
      }),
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    return {
      status: "failed",
      error: `${response.status} ${truncate(text, 180)}`,
    };
  }

  return { status: "sent" };
}
