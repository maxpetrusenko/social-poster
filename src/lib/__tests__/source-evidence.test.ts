import { describe, expect, it } from "vitest";

import { extractGithubRepoEvidenceCandidates } from "@/lib/sources/github";
import { createManualEvidenceCandidate } from "@/lib/sources/manual";
import { normalizeRssEvidenceCandidate } from "@/lib/sources/rss";
import {
  normalizeUrlEvidenceCandidate,
  parseUrlEvidenceHtml,
} from "@/lib/sources/url";

describe("source evidence normalization", () => {
  it("builds stable GitHub evidence keys for PRs and releases", () => {
    const candidates = extractGithubRepoEvidenceCandidates({
      source: { owner: "maxpetrusenko", repo: "social-poster" },
      pullRequests: [
        {
          number: 42,
          title: "Add source evidence store",
          html_url: "https://github.com/maxpetrusenko/social-poster/pull/42",
          created_at: "2026-04-14T12:00:00.000Z",
        },
      ],
      releases: [
        {
          id: 17,
          tag_name: "v0.1.0",
          name: "v0.1.0",
          html_url: "https://github.com/maxpetrusenko/social-poster/releases/tag/v0.1.0",
          published_at: "2026-04-14T15:00:00.000Z",
        },
      ],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.dedupeKey).toBe("github:repo:maxpetrusenko/social-poster:pr:42");
    expect(candidates[1]?.dedupeKey).toBe("github:repo:maxpetrusenko/social-poster:release:17");
    expect(candidates[0]?.summary).toContain("opened PR #42");
  });

  it("normalizes RSS candidates with canonical URLs and a stable dedupe key", () => {
    const candidate = normalizeRssEvidenceCandidate(
      {
        title: "  New launch post  ",
        link: "https://example.com/posts/launch?utm_source=newsletter#frag",
        contentSnippet: "<p>Short summary</p>",
        sourceName: "Example",
      },
      "https://example.com/feed.xml"
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.type).toBe("rss_item");
    expect(candidate?.title).toBe("New launch post");
    expect(candidate?.url).toBe("https://example.com/posts/launch?utm_source=newsletter");
    expect(candidate?.dedupeKey).toMatch(/^rss:/);
  });

  it("parses URL evidence from raw HTML", () => {
    const snapshot = parseUrlEvidenceHtml(
      `
      <html>
        <head>
          <title>Source backed posting</title>
          <meta name="description" content="A typed source evidence slice.">
          <meta property="og:image" content="/card.png">
        </head>
      </html>
      `,
      "https://social.maxpetrusenko.com/blog/source-backed-posting"
    );

    const candidate = normalizeUrlEvidenceCandidate({
      url: "https://social.maxpetrusenko.com/blog/source-backed-posting?ref=x#demo",
      ...snapshot,
    });

    expect(snapshot.imageUrl).toBe("https://social.maxpetrusenko.com/card.png");
    expect(candidate.title).toBe("Source backed posting");
    expect(candidate.url).toBe("https://social.maxpetrusenko.com/blog/source-backed-posting?ref=x");
    expect(candidate.dedupeKey).toMatch(/^url:/);
  });

  it("creates manual evidence candidates with a stable hash", () => {
    const candidate = createManualEvidenceCandidate({
      title: "Note from customer call",
      summary: "They asked for a source-backed posting flow.",
      url: "https://docs.example.com/notes/1",
    });

    expect(candidate.type).toBe("note");
    expect(candidate.dedupeKey).toMatch(/^manual:/);
    expect(candidate.externalId).toBe("https://docs.example.com/notes/1");
  });
});
