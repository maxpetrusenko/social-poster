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

  it("tells the writer to repair source-owned first person and recovered study URLs", () => {
    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@rohanpaul_ai",
      sourceUrl: "https://x.com/rohanpaul_ai/status/123",
      sourceText: "A study with 2,691 people shows AI saves 7.5s instead of 55.7s.",
      externalUrls: ["https://arxiv.org/abs/2605.22687"],
      hasMedia: false,
      mediaType: null,
    });

    expect(prompt).toContain("https://arxiv.org/abs/2605.22687");
    expect(prompt).toContain("do not copy \"I\", \"my\", \"we\", or \"our\"");
    expect(prompt).toContain("include the primary study URL");
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

  it("allows source embeds for long X article shares", () => {
    const sourceUrl = "https://x.com/andrewcurran_/status/2066332670817456584";
    const sourceText = [
      "The Window Has Closed",
      "",
      "If you used Fable while it was available, you know it is special in ways that will not show up on benchmarks.",
      "After using Fable, it now seems clearer than ever that the shift was driven by Mythos emerging from its training run.",
      "The frontier is now an accelerating system in which the leading models will help produce the next leading models.",
      "Countries that missed the window are choosing dependence on systems they do not own.",
      "This is the most important technology in the history of humanity.",
    ].join("\n\n");
    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@AndrewCurran_",
      sourceUrl,
      sourceText,
      hasMedia: false,
      mediaType: null,
    });

    expect(prompt).toContain("long X article/essay");
    expect(prompt).toContain("include the original source URL as the final line");
    expect(
      getXLikedAutopostContentRejection({
        content: [
          "Fable was here, then gone.",
          "",
          "That tiny shock is the whole essay.",
          "",
          "Frontier AI is becoming infrastructure now: access, compute, models, talent, the ability to use models to build the next models.",
          "",
          "Countries and companies that treat this like another software wave are choosing dependence.",
          "",
          "Worth reading.",
          "",
          sourceUrl,
        ].join("\n"),
        sourceText,
        hasMedia: false,
        sourceUrl,
      })
    ).toBeNull();
    expect(
      getXLikedAutopostContentRejection({
        content: "Interesting AI essay.\n\nWorth reading.",
        sourceText,
        hasMedia: false,
        sourceUrl,
      })
    ).toBe("writer omitted source URL for long X article embed");
  });

  it("does not turn short article-prompt posts into long article embeds", () => {
    const sourceUrl = "https://x.com/PrajwalTomar_/status/2066497450358272493";
    const sourceText = [
      "Hermes Agent pro tip:",
      "",
      "Don't just read this article.",
      "",
      "Paste the entire thing inside your Hermes session and ask it to build your setup from it.",
      "",
      "Articles aren't content anymore.",
      "",
      "They are playbooks your agent can turn into your actual setup.",
    ].join("\n");
    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@PrajwalTomar_",
      sourceUrl,
      sourceText,
      hasMedia: false,
      mediaType: null,
    });

    expect(prompt).not.toContain("This source is a long X article/essay");
    expect(
      getXLikedAutopostContentRejection({
        content: [
          "Hermes Agent pro tip:",
          "",
          "Don't just read the article.",
          "",
          "Paste the whole thing into Hermes and ask it to build the setup from it:",
          "",
          "SOUL.md",
          "the first 3 profiles",
          "an overnight /goal",
          "",
          "Articles are becoming playbooks agents can turn into working systems.",
        ].join("\n"),
        sourceText,
        hasMedia: false,
        sourceUrl,
      })
    ).toBeNull();
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

  it("rejects copied first-person source voice", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "I basically never write my own /goal anymore. I ask Codex to write it.",
        sourceText: "I basically never write my own /goal anymore. I ask Codex to write it.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned source verbatim");

    expect(
      getXLikedAutopostContentRejection({
        content: "I ask Codex to write the goal before it starts.",
        sourceText: "I basically never write my own /goal anymore. I ask Codex to write it.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer copied source-owned first person into Max voice");
  });

  it("rejects study drafts that omit a recovered primary source URL", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "AI feels faster before it is faster. Measured saving: 7.5 seconds.",
        sourceText: "A study with 2,691 people shows AI saves 7.5 seconds instead of the expected 55.7 seconds.",
        externalUrls: ["https://arxiv.org/abs/2605.22687"],
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer omitted recovered primary study URL");

    expect(
      getXLikedAutopostContentRejection({
        content: [
          "AI feels faster before it is faster.",
          "",
          "Measured saving: 7.5 seconds.",
          "",
          "Study: https://arxiv.org/abs/2605.22687",
        ].join("\n"),
        sourceText: "A study with 2,691 people shows AI saves 7.5 seconds instead of the expected 55.7 seconds.",
        externalUrls: ["https://arxiv.org/abs/2605.22687"],
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBeNull();
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
