import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanRichText } from "./content-clean.ts";

test("cleanRichText strips escaped html blocks", () => {
  assert.equal(
    cleanRichText("&lt;!-- SC_OFF --&gt; &lt;div class='md'&gt;&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;/div&gt;"),
    "Hello & welcome"
  );
});

test("cleanRichText decodes numeric entities", () => {
  assert.equal(cleanRichText("AI&#39;s future &#x26; tooling"), "AI's future & tooling");
});
