import test from "node:test";
import assert from "node:assert/strict";
import {
  detectReplyLanguage,
  isReplyLanguageAllowed,
  normalizeReplyLanguage,
} from "./language.ts";

test("reply language filter allows English tweets", () => {
  const text =
    "Firecrawl released an open source web agent framework for search, scrape, and browser interactions.";

  assert.equal(detectReplyLanguage(text), "en");
  assert.equal(isReplyLanguageAllowed(text, "en"), true);
});

test("reply language filter blocks Indonesian tweets by default", () => {
  const text =
    "Firecrawl rilis Web Agent Framework open source 100%, dipake untuk bikin AI agent yg bisa nyari ingfo di web.";

  assert.equal(detectReplyLanguage(text), "other");
  assert.equal(isReplyLanguageAllowed(text, "en"), false);
  assert.equal(isReplyLanguageAllowed(text, "any"), true);
});

test("reply language setting defaults to English", () => {
  assert.equal(normalizeReplyLanguage("any"), "any");
  assert.equal(normalizeReplyLanguage("id"), "en");
  assert.equal(normalizeReplyLanguage(null), "en");
});
