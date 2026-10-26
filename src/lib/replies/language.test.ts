import { test } from "vitest";
import assert from "node:assert/strict";
import {
  hasNonLatinScript,
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

test("hasNonLatinScript flags CJK or Cyrillic heavy text and passes English", () => {
  assert.equal(hasNonLatinScript("我把 Claude Code 官方文档编译成中文了"), true);
  assert.equal(hasNonLatinScript("Привет, как работает этот агент"), true);
  assert.equal(hasNonLatinScript("Shipping subagents in Claude Code today"), false);
  assert.equal(hasNonLatinScript(""), false);
});
