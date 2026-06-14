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
    expect(prompt).toContain("keep the original train of thought");
    expect(prompt).toContain("Change roughly 5-15 words");
    expect(prompt).toContain("builder signal");
    expect(prompt).toContain("Hard length budget: 1200 characters");
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
    expect(prompt).toContain("Hard length budget: 600 characters");
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

  it("rejects text-only drafts that copy the source verbatim", () => {
    const sourceText = "AI just made the answer key free.\n\nEveryone has it instantly now.";

    expect(
      getXLikedAutopostContentRejection({
        content: sourceText,
        sourceText,
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned source verbatim");
  });

  it("rejects drafts that exceed the final X-safe length budget", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "A".repeat(1201),
        sourceText: "Short source.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer exceeded 1200 character budget");

    expect(
      getXLikedAutopostContentRejection({
        content: "A".repeat(601),
        sourceText: "Short source with media.",
        hasMedia: true,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer exceeded 600 character budget");
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

  it("rejects Garry-style drafts that lose the original train of thought", () => {
    const sourceText = [
      "Elite admissions select for one trait: getting the known answer faster than anyone else.",
      "AI just made the answer key free.",
      "So the kids trained hardest to win mastered the one thing that's now a commodity.",
      "We need a new training.",
      "How to be the first person standing in a new land.",
    ].join("\n\n");

    expect(
      getXLikedAutopostContentRejection({
        content: "AI makes old schooling less useful. The future belongs to explorers.",
        sourceText,
        hasMedia: false,
        sourceUrl: "https://x.com/garrytan/status/2066153523868467702",
      })
    ).toBe("writer lost train-of-thought terms: answer key, commodity, new training, new land");

    expect(
      getXLikedAutopostContentRejection({
        content: [
          "AI just made the answer key free.",
          "",
          "The commodity is knowing the old answer faster.",
          "",
          "We need a new training for the questions with no answer key yet.",
          "",
          "The future belongs to people willing to stand in the new land first.",
        ].join("\n"),
        sourceText,
        hasMedia: false,
        sourceUrl: "https://x.com/garrytan/status/2066153523868467702",
      })
    ).toBeNull();
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
