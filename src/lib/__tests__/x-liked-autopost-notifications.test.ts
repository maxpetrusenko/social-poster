import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildXLikedAutopostFailureMessage,
  isXLikedAutopostOperationalFailure,
  notifyXLikedAutopostOperationalFailure,
} from "../x-liked-autopost-notifications.ts";

describe("X liked autopost operational notifications", () => {
  it("classifies operational failures separately from content validation", () => {
    expect(
      isXLikedAutopostOperationalFailure({
        platform: "x",
        classification: "rate_limited",
        error: "429",
      })
    ).toBe(true);
    expect(
      isXLikedAutopostOperationalFailure({
        platform: "x",
        classification: "validation_error",
        error: "too long",
      })
    ).toBe(false);
  });

  it("builds a Telegram message with run context", () => {
    const message = buildXLikedAutopostFailureMessage({
      runId: "run-1",
      workspaceId: "workspace-1",
      sourceUrl: "https://x.com/source/status/123",
      failures: [
        {
          platform: "x",
          classification: "auth_error",
          error: "Bird cookie expired",
        },
      ],
    });

    expect(message).toContain("Social Poster liked-post failure");
    expect(message).toContain("run_id: run-1");
    expect(message).toContain("source: https://x.com/source/status/123");
    expect(message).toContain("class=auth_error");
    expect(message).toContain("/dashboard/pipeline?runId=run-1");
  });

  it("sends Telegram only when an operational failure exists", async () => {
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousChat = process.env.TELEGRAM_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat";
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));

    try {
      await expect(
        notifyXLikedAutopostOperationalFailure({
          runId: "run-1",
          workspaceId: "workspace-1",
          sourceUrl: "https://x.com/source/status/123",
          failures: [
            {
              platform: "x",
              classification: "validation_error",
              error: "too long",
            },
          ],
          fetchImpl,
        })
      ).resolves.toEqual({ status: "skipped", reason: "no operational failures" });
      expect(fetchImpl).not.toHaveBeenCalled();

      await expect(
        notifyXLikedAutopostOperationalFailure({
          runId: "run-1",
          workspaceId: "workspace-1",
          sourceUrl: "https://x.com/source/status/123",
          failures: [
            {
              platform: "linkedin_personal",
              classification: "auth_error",
              error: "403",
            },
          ],
          fetchImpl,
        })
      ).resolves.toEqual({ status: "sent" });
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = previousToken;
      if (previousChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
      else process.env.TELEGRAM_CHAT_ID = previousChat;
    }
  });
});
