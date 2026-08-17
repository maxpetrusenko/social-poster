import assert from "node:assert/strict";
import { test } from "vitest";

import { isAiTopicStory } from "./ai-topic-gate.ts";

function story(title: string, summary = "", sourceName = "HN") {
  return { title, summary, sourceName };
}

// Regression cases taken from real recent posts that should have been blocked.
test("gate rejects the non-AI stories that actually went out in August", () => {
  assert.equal(isAiTopicStory(story("The weekend is 100 years old", "The weekend was born in 1926 when Henry Ford gave workers Saturday and Sunday off.")), false);
  assert.equal(isAiTopicStory(story("Super El Niño Keeps Growing as New Forecasts Reach Record Territory Ahead Winter", "The 2026 Super El Niño is rapidly intensifying with record westerly wind anomalies.")), false);
  assert.equal(isAiTopicStory(story("The First At-Home Test for Infected Ticks Could Improve Lyme Disease Diagnosis", "LymeAlert, launching August 2026, offers the first at-home test to detect Lyme-infected ticks.")), false);
  assert.equal(isAiTopicStory(story("The other Sean Byrne doesn't exist", "The Sean Byrne on the US Consolidated Screening List is a fabricated identity used by an Irish firm.")), false);
  assert.equal(isAiTopicStory(story("In Australia, a Home Battery Boom Has Helped Cut Wholesale Power Prices in Half", "Australia's 30% subsidy program has installed 500K+ home batteries since mid-2025.")), false);
});

// Regression cases taken from real posts that should keep passing.
test("gate accepts the AI stories that went out", () => {
  assert.equal(isAiTopicStory(story("Claude: System Prompts", "Claude's web and mobile apps use periodically updated system prompts.", "Anthropic")), true);
  assert.equal(isAiTopicStory(story("Accelerating GPT-5.6 Sol Ultrafast", "GPT-5.6 Sol Ultrafast delivers up to 750 tokens/sec with no quality loss.", "Cerebras")), true);
  assert.equal(isAiTopicStory(story("Gemini 3.7 Flash", "Gemini 3.7 Flash improves coding accuracy and debugging over 3.6.")), true);
  assert.equal(isAiTopicStory(story("Codex in ChatGPT desktop app for Linux is now in preview", "The ChatGPT desktop app for Linux is in preview with Codex.")), true);
  assert.equal(isAiTopicStory(story("Auto-research with codex: How I achieved a 232x Faster Kernel", "In GPU Mode's contest, a batched compact-Householder QR kernel reached a 232x speedup.")), true);
});

test("gate accepts AI topics that only appear in the summary", () => {
  assert.equal(isAiTopicStory(story("Why we rebuilt our stack", "We switched to an LLM-based pipeline with RAG over our docs.")), true);
});

test("gate backstops with the AI-source allowlist when text is sparse", () => {
  assert.equal(isAiTopicStory(story("New release notes", "Everything you need to know about this week.", "Google AI")), true);
  assert.equal(isAiTopicStory(story("New release notes", "Everything you need to know about this week.", "The Verge")), false);
});

test("gate does not false-positive on bare ai/model/agent substrings", () => {
  assert.equal(isAiTopicStory(story("Why email said nothing new", "Maintain availability across domains.")), false);
  assert.equal(isAiTopicStory(story("Fashion model shares runway secrets", "A modeling career in Milan.")), false);
  assert.equal(isAiTopicStory(story("Real estate agent tips", "How to pick your next agent.")), false);
});
