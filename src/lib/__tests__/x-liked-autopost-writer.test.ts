import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildXLikedAutopostWriterPrompt,
  getXLikedAutopostContentRejection,
  parseWriterResponse,
} from "../x-liked-autopost-writer.ts";

describe("X liked autopost writer", () => {
  it("passes the x-posting skill rules into the writer prompt", () => {
    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@garrytan",
      sourceUrl: "https://x.com/garrytan/status/123",
      sourceText: "Everyone building AI agents is focused on the prefrontal cortex and cerebellum.",
      hasMedia: false,
      mediaType: null,
    });

    expect(prompt).toContain("X Posting rules for Max Petrusenko");
    expect(prompt).toContain("Reposting is usually curation");
    expect(prompt).toContain("preserve the frame, metaphor, numbers, and ending");
    expect(prompt).toContain("builder signal");
    expect(prompt).toContain("Hard length budget: 275 characters");
  });

  it("feeds rejection feedback into retry prompts", () => {
    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@garrytan",
      sourceUrl: "https://x.com/garrytan/status/123",
      sourceText: "Everyone building AI agents is focused on the prefrontal cortex and cerebellum.",
      hasMedia: true,
      mediaType: "image",
      previousRejection: "writer returned thread numbering",
    });

    expect(prompt).toContain("Previous draft failed: writer returned thread numbering");
    expect(prompt).toContain("Hard length budget: 220 characters");
  });

  it("rejects generic fallback phrases before publish", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "Builder signal worth tracking: workflow changes show up first.",
        sourceText: "Codex as orchestrator and DeepSeek as executor.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toMatch(/generic phrase/);
  });

  it("rejects text-only source URLs and thread markers", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "1/2 This deserves a thread.",
        sourceText: "This deserves a thread.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned thread numbering");

    expect(
      getXLikedAutopostContentRejection({
        content: "Good point.\n\nhttps://x.com/source/status/123",
        sourceText: "Good point.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer included source URL for text-only repost");
  });

  it("rejects drafts that exceed the final X-safe length budget", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "A".repeat(276),
        sourceText: "Short source.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer exceeded 275 character budget");

    expect(
      getXLikedAutopostContentRejection({
        content: "A".repeat(221),
        sourceText: "Short source with media.",
        hasMedia: true,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer exceeded 220 character budget");
  });

  it("rejects drafts that lose required concrete source hooks", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "Agent tools are becoming reflex loops.",
        sourceText: "Everyone building AI agents is focused on the prefrontal cortex and cerebellum.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer lost the source metaphor");

    expect(
      getXLikedAutopostContentRejection({
        content: "Useful daily scanner setup.",
        sourceText: "Hermes agent with a Perplexity Bumblebee scanner for supply-chain surprises.",
        hasMedia: true,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer lost the concrete demo hook");
  });

  it("parses Responses JSON content", () => {
    expect(
      parseWriterResponse({
        output: [
          {
            type: "message",
            content: [{ text: JSON.stringify({ content: "Close to original.\n\nUseful." }) }],
          },
        ],
      })
    ).toBe("Close to original.\n\nUseful.");
  });
});
