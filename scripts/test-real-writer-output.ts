#!/usr/bin/env tsx
/**
 * Test real writer output for HowToPrompt__ post
 */

// Mock server-only for CLI execution
import { Module } from "node:module";
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string, ...args: never[]) {
  if (id === "server-only") return {};
  return originalRequire.call(this, id, ...args);
};

import { draftXLikedAutopostContent } from "../src/lib/x-liked-autopost-writer";

const sourceText = `Researchers mathematically proved that AI will cause something worse than mass unemployment.

They call it "The Tragedy of the Cognitive Commons."

Every industry relies on a shared pool of deep professional expertise. This expertise doesn't just magically appear. It regenerates generation after generation.

How? Through struggle.

Junior employees do the hard, repetitive, frustrating work. In exchange, they slowly build what researchers call "Internalized Mastery."

But right now, AI is completely annihilating junior-level work.

Companies are celebrating massive productivity boosts by automating the entry-level grind. (Anthropic's own data shows their technical junior hiring has plunged 33% as AI agents take over the pipeline).

It looks like efficiency. But it is actually a time bomb.

The researchers highlight a concept called the "Validation Tether."

Effective human oversight of AI depends entirely on deep domain expertise. When an AI hallucinates or makes a critical error, a human expert catches it.

The experts validating AI outputs today look competent because they spent a decade doing the grunt work before AI existed.

The terrifying question the paper asks is this:

Who comes after them?

When the current generation of experts retires, there will be no one left with the Internalized Mastery required to spot when the machine is wrong. We are completely severing the pipeline that creates human competence.

We are trading our long-term intellectual independence for short-term productivity boosts.

Every time you let AI bypass the struggle, you are borrowing expertise from the future.

And the interest rate is our ability to think for ourselves.`;

async function main() {
  console.log("Testing real writer with HowToPrompt__ post...\n");
  console.log("Source length:", sourceText.length, "chars\n");
  
  try {
    const result = await draftXLikedAutopostContent({
      workspaceId: "test-workspace",
      sourceText,
      sourceUrl: "https://x.com/HowToPrompt__/status/2113248744905064464",
      authorHandle: "@HowToPrompt__",
      externalUrls: [],
      hasMedia: true,
      mediaType: "image",
    });

    console.log("✅ Writer succeeded\n");
    console.log("Generated content:");
    console.log("---");
    console.log(result.content);
    console.log("---");
    console.log("\nLength:", result.content.length, "chars");
    console.log("Model:", result.model);
    console.log("Source:", result.modelSource);
    console.log("Trace:", result.traceUrl);
    console.log("Review:", result.review ? "enabled" : "disabled (as expected)");
  } catch (error) {
    console.error("❌ Writer failed:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

main();
