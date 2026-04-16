import test from "node:test";
import assert from "node:assert/strict";

import { writePostCaption } from "./script-writer.ts";

test("writePostCaption defaults stay source-faithful and avoid banned hype phrases", () => {
  const story = {
    title: "Claude now requires government ID verification before subscription",
    summary:
      "Anthropic now asks for Persona based identity verification before users can start a Claude subscription.",
  };

  const xPost = writePostCaption(story, "x", {
    transformationPrompt: [
      "mode: source-faithful",
      "opener: none",
      "ban_phrases: wild|pay attention|interesting",
      "title_case_on_x: true",
    ].join("\n"),
  });

  assert.match(xPost, /Claude now requires government ID verification before subscription/);
  assert.doesNotMatch(xPost, /\bwild\b/i);
  assert.doesNotMatch(xPost, /pay attention/i);
});

test("writePostCaption regeneration seed changes output without changing the selected story", () => {
  const story = {
    title: "Compile English function descriptions into 22MB neural programs that run locally via llama.cpp",
    summary:
      "The project compiles natural language function descriptions into small local neural programs for llama.cpp workflows.",
  };

  const seed0 = writePostCaption(story, "linkedin", { seed: 0 });
  const seed1 = writePostCaption(story, "linkedin", { seed: 1 });

  assert.notEqual(seed0, seed1);
  assert.match(seed0, /Compile English function descriptions/);
  assert.match(seed1, /Compile English function descriptions/);
});

test("writePostCaption honors transformation prompt bans for reaction openers", () => {
  const story = {
    title: "Gemma 4 runs on local hardware now",
    summary: "Builders are testing Gemma 4 across local inference setups.",
  };

  const post = writePostCaption(story, "x", {
    xTemplate: "{{reaction}} {{title}}",
    transformationPrompt: "opener: reaction\nban_phrases: notable shift",
    seed: 2,
  });

  assert.equal(post, "Gemma 4 runs on local hardware now");
});
