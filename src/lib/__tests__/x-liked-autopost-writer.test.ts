import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/langsmith", () => ({
  callOpenAIResponses: vi.fn(),
}));
vi.mock("@/lib/model-runtime", () => ({
  resolveOpenAIResponsesRuntime: vi.fn(),
}));

import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveOpenAIResponsesRuntime } from "@/lib/model-runtime";
import {
  buildXLikedAutopostReviewPrompt,
  buildXLikedAutopostWriterPrompt,
  draftXLikedAutopostContent,
  getXLikedAutopostContentRejection,
  parseReviewerResponse,
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
    expect(prompt).toContain("Reposting can be curation or analysis");
    expect(prompt).toContain("keep the original train of thought");
    expect(prompt).toContain("Change roughly 5-15 words");
    expect(prompt).toContain("Do not call generic editorial preferences “Max voice.”");
    expect(prompt).toContain("generated_uncertain");
    expect(prompt).toContain("Do not add automatic source replies or credit/source footer lines");
    expect(prompt).toContain("Auto-publish requires an independent reviewer pass");
    expect(prompt).toContain("Deterministic direct-copy and fallback paths cannot bypass the reviewer");
    expect(prompt).toContain("Every source-backed factual/news repost needs a verification pass");
    expect(prompt).toContain("Do not add an opinionated implication");
    expect(prompt).toContain("not permanent Max-language rules");
    expect(prompt).toContain("Hard length budget: 1200 characters");
    expect(prompt).toContain("petergyang/no-ai-slop");
    expect(prompt).toContain("Instruction precedence:");
    expect(prompt).toContain("<untrusted-source-data>");
  });

  it("builds an independent reviewer prompt from the same x-posting skill contract", () => {
    const prompt = buildXLikedAutopostReviewPrompt({
      authorHandle: "@IBMNews",
      sourceUrl: "https://x.com/IBMNews/status/123",
      sourceText: "IBM debuted 0.7nm chip research with 40% SRAM scaling.",
      externalUrls: ["https://newsroom.ibm.com/example"],
      hasMedia: false,
      mediaType: null,
      content: "IBM's 0.7nm chip research points at AI memory pressure.",
    });

    expect(prompt).toContain("independent reviewer");
    expect(prompt).toContain("Do not rewrite it");
    expect(prompt).toContain("send the exact failure packet back to the writer");
    expect(prompt).toContain("language provenance");
    expect(prompt).toContain("invents Max's opinion");
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

  it("rejects no-ai-slop patterns without turning them into Max voice rules", () => {
    const base = {
      sourceText: "IBM published 0.7nm chip research with 40% SRAM scaling.",
      externalUrls: ["https://newsroom.ibm.com/example"],
      hasMedia: false,
      sourceUrl: "https://x.com/source/status/123",
    };

    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "This is not about chip size. It is about memory density.",
      })
    ).toBe("writer used no-ai-slop pattern: binary_contrast");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "The uncomfortable truth is that SRAM scaling drives the useful result.",
      })
    ).toBe("writer used no-ai-slop pattern: throat_clearing");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "IBM's research marks a pivotal moment for chip design.",
      })
    ).toBe("writer used no-ai-slop pattern: importance_puffery");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "IBM published 0.7nm research. SRAM scales by 40%. Density is the result.",
      })
    ).toBe("writer used no-ai-slop pattern: stacked_short_sentences");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "IBM's 0.7nm research reports 40% SRAM scaling, which concentrates the result in memory density.",
      })
    ).toBeNull();
  });

  it("passes a factual-news liked post without off-X verification (social-source lane)", () => {
    // Source matches the factual/news heuristic but Max already pre-vouched by
    // liking it. The deterministic gate should NOT block on missing external
    // URLs; the independent reviewer is the safety backstop.
    expect(
      getXLikedAutopostContentRejection({
        content: "IBM reportedly has a sub-1nm chip path that could matter for AI compute.",
        sourceText: "IBM reportedly debuted a 0.7nm chip with 100B transistors and 70% lower power.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBeNull();

    // Quote-tweet whose only URL is the X source itself still passes.
    expect(
      getXLikedAutopostContentRejection({
        content: "Reposting: solid point on the agent loop.",
        sourceText: "Models are now agents. Stop calling them tools.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBeNull();
  });

  it("still keeps the study-URL requirement when a study URL is recovered", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "GLM 5.2 scored 57.3% on the new benchmark.",
        sourceText: "GLM 5.2 scored 57.3% on a new benchmark. See the paper.",
        externalUrls: ["https://arxiv.org/abs/2026.01234"],
        hasMedia: true,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer omitted recovered primary study URL");
  });

  it("still rejects REVIEW_NEEDED drafts", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "REVIEW_NEEDED: verify central claim before publishing.",
        sourceText: "IBM reportedly debuted a 0.7nm chip with 100B transistors and 70% lower power.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer requires source verification");
  });

  it("rejects unsupported benchmark framing introduced by the writer", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "GLM 5.2 scored 57.3% accuracy with reasoning off and 68.5% with reasoning on.",
        sourceText: "GLM 5.2 scored 57.3% with reasoning off and 68.5% with reasoning on.",
        externalUrls: ["https://docs.together.ai/docs/glm-5.2-quickstart"],
        hasMedia: true,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer introduced unsupported accuracy framing");

    expect(
      getXLikedAutopostContentRejection({
        content: "Same model, same problem set, same harness.",
        sourceText: "Same model, same problem set, different harness settings.",
        externalUrls: ["https://docs.together.ai/docs/glm-5.2-quickstart"],
        hasMedia: true,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer contradicted harness setting difference");
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

  it("rejects source and credit footer labels", () => {
    for (const footer of ["Source: @tom_doerr", "Credit: @tom_doerr", "via @tom_doerr", "h/t @tom_doerr"]) {
      expect(
        getXLikedAutopostContentRejection({
          content: ["Useful AI workflow note.", "", footer].join("\n"),
          sourceText: "Useful AI workflow note.",
          hasMedia: true,
          sourceUrl: "https://x.com/source/status/123",
        })
      ).toBe("writer included source/credit label");
    }
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
    ).toBe("writer copied source-owned first person as Max's statement");
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

  it("parses reviewer JSON content", () => {
    expect(
      parseReviewerResponse({
        output: [
          {
            type: "message",
            content: [{ text: JSON.stringify({ approved: false, issues: ["unsupported claim"], repairInstruction: "Remove the shipping claim." }) }],
          },
        ],
      })
    ).toEqual({
      approved: false,
      issues: ["unsupported claim"],
      repairInstruction: "Remove the shipping claim.",
    });
  });

  it("sends reviewer failures back to the writer before returning a publishable draft", async () => {
    vi.mocked(resolveOpenAIResponsesRuntime).mockResolvedValue({
      apiKey: "test-key",
      model: "test-model",
      source: "env",
    });
    vi.mocked(callOpenAIResponses)
      .mockResolvedValueOnce({
        data: {
          output: [
            {
              type: "message",
              content: [{ text: JSON.stringify({ content: "IBM released a shipping 0.7nm chip today.\n\nAI compute gets cheaper immediately." }) }],
            },
          ],
        },
        trace: { url: "writer-1" },
      } as never)
      .mockResolvedValueOnce({
        data: {
          output: [
            {
              type: "message",
              content: [{ text: JSON.stringify({ approved: false, issues: ["draft turns research into a shipping chip"], repairInstruction: "Keep this framed as IBM research and remove immediate-cost claims." }) }],
            },
          ],
        },
        trace: { url: "reviewer-1" },
      } as never)
      .mockResolvedValueOnce({
        data: {
          output: [
            {
              type: "message",
              content: [{ text: JSON.stringify({ content: "IBM's 0.7nm chip research points at the next AI infrastructure constraint.\n\nThe useful detail is SRAM scaling: memory movement keeps becoming a bigger part of the compute bill." }) }],
            },
          ],
        },
        trace: { url: "writer-2" },
      } as never)
      .mockResolvedValueOnce({
        data: {
          output: [
            {
              type: "message",
              content: [{ text: JSON.stringify({ approved: true, issues: [], repairInstruction: "" }) }],
            },
          ],
        },
        trace: { url: "reviewer-2" },
      } as never);

    const result = await draftXLikedAutopostContent({
      workspaceId: "workspace-1",
      authorHandle: "@IBMNews",
      sourceUrl: "https://x.com/IBMNews/status/123",
      sourceText: "IBM debuted 0.7nm chip research with 40% SRAM scaling for AI workloads.",
      externalUrls: ["https://newsroom.ibm.com/example"],
      hasMedia: false,
      mediaType: null,
    });

    expect(result.content).toContain("0.7nm chip research");
    expect(result.content).toContain("SRAM scaling");
    expect(result.review.approved).toBe(true);
    expect(vi.mocked(callOpenAIResponses)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(callOpenAIResponses).mock.calls[2]?.[0].body.input).toContain("reviewer rejected draft");
    expect(vi.mocked(callOpenAIResponses).mock.calls[2]?.[0].body.input).toContain("Keep this framed as IBM research");
  });
});
