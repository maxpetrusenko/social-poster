import { describe, expect, it } from "vitest";

import {
  parseRecurringPostIntent,
  parseRssKeepIntent,
  sanitizeSocialAgentAttachments,
} from "@/lib/social-agent/action-intents";

describe("social agent action intents", () => {
  it("parses an RSS keep-only request with a named source", () => {
    expect(parseRssKeepIntent("remove all my rss acc but Hacker News")).toEqual({
      kind: "rss_keep_only",
      keepQuery: "Hacker News",
    });
  });

  it("asks for the kept RSS source when the user only says one", () => {
    expect(parseRssKeepIntent("delete all rss sources except one")).toEqual({
      kind: "rss_keep_only",
      keepQuery: null,
    });
  });

  it("parses recurring post cadence, platform, and copy", () => {
    expect(
      parseRecurringPostIntent(
        "create recurring post daily at 9 AM on X and LinkedIn: Ship the weekly product note"
      )
    ).toMatchObject({
      kind: "recurring_post_create",
      cron: "0 9 * * *",
      cronHuman: "Every day at 9 AM",
      platformQuery: "X and LinkedIn",
      content: "Ship the weekly product note",
    });
  });

  it("uses uploaded images as recurring post media", () => {
    expect(
      parseRecurringPostIntent("create recurring post every weekday at 8:30 AM on instagram", [
        {
          url: "https://cdn.example.com/post.png",
          contentType: "image/png",
          name: "post.png",
        },
      ])
    ).toMatchObject({
      cron: "30 8 * * 1-5",
      mediaUrl: "https://cdn.example.com/post.png",
    });
  });

  it("sanitizes chat attachments to http image records", () => {
    expect(
      sanitizeSocialAgentAttachments([
        { url: "https://cdn.example.com/a.png", contentType: "image/png", size: 1234 },
        { url: "file:///tmp/a.png", contentType: "image/png" },
      ])
    ).toEqual([
      {
        url: "https://cdn.example.com/a.png",
        contentType: "image/png",
        size: 1234,
      },
    ]);
  });
});
