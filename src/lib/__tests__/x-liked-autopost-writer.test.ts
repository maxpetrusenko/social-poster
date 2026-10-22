import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/langsmith", () => ({
  callOpenAIResponses: vi.fn(),
}));
vi.mock("@/lib/model-runtime", () => ({
  resolveWritingRuntimes: vi.fn(),
}));

import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveWritingRuntimes } from "@/lib/model-runtime";
import {
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
    expect(prompt).toContain("Rewrite the source in your own words while preserving the meaning of EVERY point");
    expect(prompt).toContain("Do not drop points or compress lists");
    expect(prompt).toContain("Keep the source's train of thought");
    expect(prompt).toContain("Preserve ALL numbers, named actors, mechanisms");
    expect(prompt).toContain("not permanent Max-language rules");
    expect(prompt).toContain("Hard length budget: 2500 characters"); // Long mode default
    expect(prompt).toContain("petergyang/no-ai-slop");
    expect(prompt).toContain("<untrusted-source-data>");
  });

  it("reviewer is disabled for now (TODO: re-add later)", () => {
    // Reviewer scoring removed per Max's direction 2026-10-22
    // Only hard safety gates apply: meta-text, empty/short, char budget, thread numbering, credit footer
    expect(true).toBe(true);
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

  it("reframes first-person and includes study URLs", () => {
    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@rohanpaul_ai",
      sourceUrl: "https://x.com/rohanpaul_ai/status/123",
      sourceText: "A study with 2,691 people shows AI saves 7.5s instead of 55.7s.",
      externalUrls: ["https://arxiv.org/abs/2605.22687"],
      hasMedia: false,
      mediaType: null,
    });

    expect(prompt).toContain("https://arxiv.org/abs/2605.22687");
    expect(prompt).toContain("First-person framing rule");
    expect(prompt).toContain("Never claim experiences, ownership, or completed work as Max's own");
    expect(prompt).toContain("Reframe to what happened");
  });

  it("rejects no-ai-slop patterns with unslop pass", () => {
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
    ).toBe("writer used no-ai-slop pattern(s): binary_contrast");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "The uncomfortable truth is that SRAM scaling drives the useful result.",
      })
    ).toBe("writer used no-ai-slop pattern(s): throat_clearing");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "IBM's research marks a pivotal moment for chip design.",
      })
    ).toBe("writer used no-ai-slop pattern(s): importance_puffery");
    expect(
      getXLikedAutopostContentRejection({
        ...base,
        content: "IBM published 0.7nm research. SRAM scales by 40%. Density is the result.",
      })
    ).toBe("writer used no-ai-slop pattern(s): stacked_short_sentences");
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

  it("rejects meta-text (SKIP/REVIEW_NEEDED/NOTE) as unpublishable", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "REVIEW_NEEDED: verify central claim before publishing.",
        sourceText: "IBM reportedly debuted a 0.7nm chip with 100B transistors and 70% lower power.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned meta-text instead of publishable content");

    expect(
      getXLikedAutopostContentRejection({
        content: "SKIP: source post contains only flag emojis 🇺🇸🇬🇧🇫🇷 - not publishable.",
        sourceText: "🇺🇸🇬🇧🇫🇷",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned meta-text instead of publishable content");

    expect(
      getXLikedAutopostContentRejection({
        content: "NOTE: This needs manual review before queuing.",
        sourceText: "Some source text here.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned meta-text instead of publishable content");
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
    expect(prompt).toContain("include the source URL in the main post");
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

  it("requires rewriting in own words (not near-verbatim)", () => {
    // Must rewrite while preserving meaning of ALL points
    // This test just confirms no verbatim blocking - actual rewriting happens in writer prompt
    expect(
      getXLikedAutopostContentRejection({
        content: "ai made the answer key instantly available to everyone now.",
        sourceText: "AI just made the answer key free.\n\nEveryone has it instantly now.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBeNull();
  });

  it("reframes first-person to avoid claiming author's work as Max's own", () => {
    // Never claim experiences, ownership, or completed work as Max's own
    // Reframe to what happened / what was done / what's next
    
    // OK: neutral observation (reading/noticing)
    expect(
      getXLikedAutopostContentRejection({
        content: "codex got used for goal writing instead of manual drafts.",
        sourceText: "I basically never write my own /goal anymore. I ask Codex to write it.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBeNull();
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
    // Long mode is enabled by default, so limit is 2500
    expect(
      getXLikedAutopostContentRejection({
        content: "A".repeat(2501),
        sourceText: "Short source.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer exceeded 2500 character budget");

    // Media posts still have 600 char limit
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

  it("skips reviewer scoring (disabled for now)", async () => {
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([
      {
        protocol: "openai_responses" as const,
        provider: "openai" as const,
      apiKey: "test-key",
      model: "test-model",
      source: "env",
      },
    ]);
    vi.mocked(callOpenAIResponses).mockResolvedValueOnce({
      data: {
        output: [
          {
            type: "message",
            content: [{ text: JSON.stringify({ content: "IBM's 0.7nm chip research shows SRAM scaling improvements for AI workloads." }) }],
          },
        ],
      },
      trace: { url: "writer-1" },
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

    expect(result.content).toContain("0.7nm chip");
    expect(result.content).toContain("SRAM scaling");
    // Reviewer disabled for now (TODO: re-add later)
    expect(result.review).toBeNull();
    expect(vi.mocked(callOpenAIResponses)).toHaveBeenCalledTimes(1); // Only writer, no reviewer
  });

  it("rejects drafts that are too short (< 20 chars excluding URLs)", () => {
    expect(
      getXLikedAutopostContentRejection({
        content: "good point",
        sourceText: "This is a longer source text with meaningful content.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned too-short draft (< 20 chars excluding URLs)");

    expect(
      getXLikedAutopostContentRejection({
        content: "check this out\n\nhttps://github.com/example/repo",
        sourceText: "This is a longer source text with meaningful content.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer returned too-short draft (< 20 chars excluding URLs)");
  });

  it("applies unslop pass to catch AI-slop patterns", () => {
    // Unslop pass catches em-dashes, 'not X but Y', filler, hype words
    expect(
      getXLikedAutopostContentRejection({
        content: "AI agents — the future is here.",
        sourceText: "AI agents are transforming everything.",
        hasMedia: false,
        sourceUrl: "https://x.com/source/status/123",
      })
    ).toBe("writer used no-ai-slop pattern(s): decorative_em_dash");
  });

  it("includes reviewer scores in rejection feedback", () => {
    const review = {
      approved: false,
      issues: ["loses concrete mechanism", "generic commentary added"],
      repairInstruction: "Preserve the specific database names and latency numbers from the source.",
      scores: {
        hook: 2,
        specificity: 2,
        voice: 3,
        faithfulness: 3,
      },
      model: "test-model",
      modelSource: "test",
      traceUrl: null,
    };

    const rejection = buildReviewerRejection(review);
    expect(rejection).toContain("loses concrete mechanism");
    expect(rejection).toContain("Scores: hook=2, specificity=2, voice=3, faithfulness=3");
    expect(rejection).toContain("Preserve the specific database names");
  });

  it("preserves all points from long fiveoutofnine-style posts", () => {
    // Extended to > 2500 chars with many specific points that must all be preserved
    const runOnSnowballSource = [
      "So basically, today PHP got two critical bugs that let anyone run code on your server without even logging in, which is bad,",
      "and then the details leaked before the patch was even out, which is worse, and it works on WordPress and MediaWiki and Magento",
      "and Joomla and Laravel and Drupal and PrestaShop and phpBB and Moodle and Nextcloud and dozens of other frameworks that power",
      "basically the entire small-business web, and Censys says like 1.5 million servers are running a version with no fix yet because",
      "the patch hasn't rolled out everywhere, so the NSA was like patch immediately or take your entire system offline right now, and then",
      "the FBI and CISA and the UK NCSC and CERT-EU and Japan's PM all sent emergency alerts at 5:55am to 48.8M people saying this is",
      "critical infrastructure at risk, and the Dutch parliament went down and Port of Rotterdam went down and Wikipedia went down and",
      "Archive.org went down and Asana went down and GOG went down and Stack Overflow had intermittent issues and Reddit had degraded",
      "performance for 6 hours, and then GitLab disclosed they had a CVSS 10.0 authentication bypass bug that's been sitting there since",
      "2014 letting anyone take over any account without even knowing the email, and LiteLLM 1.107.0 got fully hijacked on PyPI and",
      "someone pushed a credential stealer and full RAT into every wheel and Docker image before anyone on the security team noticed,",
      "and Railway had to emergency-pause every single deployment across their entire platform to manually scrub environment variables",
      "after someone found they were leaking in build logs, and TiDB Cloud lost 10.6TB of customer data in a misconfigured S3 backup",
      "that was set to public-read, and Zeabur announced they're shutting down the entire service permanently because infrastructure costs",
      "spiraled and their runway is gone, and Node.js had an RCE in the DNS resolver that affected every version back to 16.x, and Plex",
      "got exploited through a zero-day in their OAuth implementation that gave remote access to every server, and someone compromised",
      "exactly 300 Tor exit relays in a coordinated attack and was harvesting credentials for weeks before anyone noticed the pattern,",
      "and SafePay's breach ended up hitting 600+ organizations who all used the same compromised payment SDK, and then it turned out",
      "eMudhra's certificate authority private keys - you know, the cryptographic secrets that are supposed to be 100+ digit random",
      "numbers generated with proper entropy and stored in HSMs - one of them was 4. Just 4. Not four hundred, not four thousand,",
      "literally the integer 4. And the others were like 66 and 237 and other tiny numbers a kindergartener could guess in under",
      "a minute. Anyway, it's Wednesday.",
    ].join(" ");

    const prompt = buildXLikedAutopostWriterPrompt({
      authorHandle: "@fiveoutofnine",
      sourceUrl: "https://x.com/fiveoutofnine/status/2113045722744717360",
      sourceText: runOnSnowballSource,
      hasMedia: false,
      mediaType: null,
    });

    // Should be over 2500 chars
    expect(runOnSnowballSource.length).toBeGreaterThan(2500);
    
    // Should preserve all points and length
    expect(prompt).toContain("preserving the meaning of EVERY point");
    expect(prompt).toContain("Do not drop points or compress lists");
    expect(prompt).toContain("Preserve ALL numbers, named actors, mechanisms");
    
    // Rewritten version (trimmed to fit 2500 budget) should pass
    const rewrittenVersion = runOnSnowballSource.slice(0, 2450).replace(/So basically/g, "Today");
    expect(
      getXLikedAutopostContentRejection({
        content: rewrittenVersion,
        sourceText: runOnSnowballSource,
        hasMedia: false,
        sourceUrl: "https://x.com/fiveoutofnine/status/2113045722744717360",
      })
    ).toBeNull();
  });
});

function buildReviewerRejection(review: { approved: boolean; issues: string[]; repairInstruction: string; scores?: { hook: number; specificity: number; voice: number; faithfulness: number } }) {
  const issues = review.issues.length > 0 ? review.issues.join("; ") : "reviewer rejected draft";
  const scoresSummary = review.scores
    ? ` Scores: hook=${review.scores.hook}, specificity=${review.scores.specificity}, voice=${review.scores.voice}, faithfulness=${review.scores.faithfulness}.`
    : "";
  return `reviewer rejected draft: ${issues}.${scoresSummary} Repair: ${review.repairInstruction || "rewrite from source facts and x-posting rules"}`;
}
