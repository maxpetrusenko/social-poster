import { describe, expect, it } from "vitest";

import {
  formatLatestPostPublishStatus,
  isPostPublishStatusQuestion,
} from "@/lib/social-agent/post-status";
import type { SocialAgentContext } from "@/lib/social-agent/context";

function context(
  recentPosts: SocialAgentContext["recentPosts"],
  pipelineRuns: SocialAgentContext["pipelineRuns"] = []
) {
  return { recentPosts, pipelineRuns };
}

describe("social agent post status", () => {
  it("recognizes latest post publish status questions", () => {
    expect(isPostPublishStatusQuestion("did it post successfully?")).toBe(true);
    expect(isPostPublishStatusQuestion("Check latest post status")).toBe(true);
    expect(isPostPublishStatusQuestion("show posted replies")).toBe(false);
  });

  it("reports successful latest post targets with links", () => {
    expect(
      formatLatestPostPublishStatus(
        context([
          {
            title: "Launch note",
            status: "published",
            contentType: "text",
            scheduledAt: null,
            targets: [
              {
                platformLabel: "X",
                status: "published",
                publishedUrl: "https://x.com/max/status/1",
                error: null,
              },
              {
                platformLabel: "LinkedIn",
                status: "published",
                publishedUrl: null,
                error: null,
              },
            ],
          },
        ])
      )
    ).toBe(
      'Yes. Latest post "Launch note" published to X, LinkedIn.\nLinks: X: https://x.com/max/status/1'
    );
  });

  it("reports partial publish failures", () => {
    expect(
      formatLatestPostPublishStatus(
        context([
          {
            title: "Campaign post",
            status: "partial_failure",
            contentType: "text",
            scheduledAt: null,
            targets: [
              {
                platformLabel: "X",
                status: "published",
                publishedUrl: null,
                error: null,
              },
              {
                platformLabel: "Instagram",
                status: "failed",
                publishedUrl: null,
                error: "Media aspect ratio unsupported.",
              },
            ],
          },
        ])
      )
    ).toBe(
      'Partially. Latest post "Campaign post" published to X, but Instagram failed.\nFailures: Instagram: Media aspect ratio unsupported.'
    );
  });

  it("reports posts with no targets and includes the latest matching run", () => {
    expect(
      formatLatestPostPublishStatus(
        context(
          [
            {
              title: "Draft note",
              status: "draft",
              contentType: "text",
              scheduledAt: null,
              targets: [],
            },
          ],
          [
            {
              status: "failed",
              trigger: "manual",
              scheduleName: null,
              postTitle: "Draft note",
              error: "No platform targets for this post.",
              durationMs: 100,
              startedAt: "2026-04-23T12:00:00.000Z",
              completedAt: "2026-04-23T12:00:01.000Z",
            },
          ]
        )
      )
    ).toBe(
      'Latest post "Draft note" is draft, but it has no platform targets yet.\nLatest run: failed, No platform targets for this post.'
    );
  });
});
