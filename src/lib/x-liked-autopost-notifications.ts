import "server-only";

import type { PublishClassification } from "@/lib/pipeline/publisher";

export type XLikedAutopostOperationalFailure = {
  platform: string;
  classification:
    | PublishClassification
    | "writer_unavailable"
    | "writer_quality_rejected"
    | "storage_error";
  error: string;
};

export type XLikedAutopostNotificationChannelResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export type XLikedAutopostNotificationResult = {
  telegram: XLikedAutopostNotificationChannelResult;
  matrix: XLikedAutopostNotificationChannelResult;
};

const OPERATIONAL_CLASSIFICATIONS = new Set<string>([
  "auth_error",
  "rate_limited",
  "provider_error",
  "network_error",
  "writer_unavailable",
  "writer_quality_rejected",
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
}): Promise<XLikedAutopostNotificationResult> {
  const failures = input.failures.filter(isXLikedAutopostOperationalFailure);
  if (failures.length === 0) {
    return {
      telegram: { status: "skipped", reason: "no operational failures" },
      matrix: { status: "skipped", reason: "no operational failures" },
    };
  }

  const message = buildXLikedAutopostFailureMessage({
    ...input,
    failures,
  });
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const fetcher = input.fetchImpl ?? fetch;

  const telegram = token && chatId
    ? await sendTelegram({ token, chatId, message, fetcher })
    : ({ status: "skipped", reason: "telegram not configured" } as const);

  const matrix = await sendMatrix({ message, fetcher });

  return { telegram, matrix };
}

async function sendTelegram(input: {
  token: string;
  chatId: string;
  message: string;
  fetcher: typeof fetch;
}): Promise<XLikedAutopostNotificationChannelResult> {
  const response = await input.fetcher(
    `https://api.telegram.org/bot${input.token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.message,
        disable_web_page_preview: true,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    return {
      status: "failed",
      error: `${response.status} ${truncate(text, 180)}`,
    };
  }

  return { status: "sent" };
}

async function sendMatrix(input: {
  message: string;
  fetcher: typeof fetch;
}): Promise<XLikedAutopostNotificationChannelResult> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL?.trim().replace(/\/+$/, "");
  const token = process.env.MATRIX_ACCESS_TOKEN?.trim();
  const roomId = (
    process.env.SOCIAL_POSTER_MATRIX_ROOM_ID ||
    process.env.MATRIX_ROOM_ID ||
    ""
  ).trim();

  if (!homeserver || !token || !roomId) {
    return { status: "skipped", reason: "matrix not configured" };
  }

  const txId = `social-poster-liked-${Date.now()}-${crypto.randomUUID()}`;
  const response = await input.fetcher(
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: input.message,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    return {
      status: "failed",
      error: `${response.status} ${truncate(text, 180)}`,
    };
  }

  return { status: "sent" };
}
