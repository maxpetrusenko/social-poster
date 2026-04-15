import assert from "node:assert/strict";
import test from "node:test";

import { extractOpenGraphImageFromHtml } from "./open-graph-image.ts";

test("extractOpenGraphImageFromHtml resolves og:image", () => {
  const result = extractOpenGraphImageFromHtml(
    '<html><head><meta property="og:image" content="/images/card.png"></head></html>',
    "https://example.com/post"
  );

  assert.equal(result, "https://example.com/images/card.png");
});

test("extractOpenGraphImageFromHtml resolves twitter:image when og:image is missing", () => {
  const result = extractOpenGraphImageFromHtml(
    '<html><head><meta name="twitter:image" content="https://cdn.example.com/card.jpg"></head></html>',
    "https://example.com/post"
  );

  assert.equal(result, "https://cdn.example.com/card.jpg");
});
