import { test } from "vitest";
import assert from "node:assert/strict";
import { isPostingEnabled, POSTING_PAUSED_ERROR } from "./posting-kill-switch";

test("isPostingEnabled defaults to true and honours false/0/off/no", () => {
  assert.equal(isPostingEnabled({}), true);
  assert.equal(isPostingEnabled({ POSTING_ENABLED: "true" }), true);
  for (const v of ["false", "FALSE", " false ", "0", "off", "no"]) {
    assert.equal(isPostingEnabled({ POSTING_ENABLED: v }), false, v);
  }
  assert.match(POSTING_PAUSED_ERROR, /POSTING_ENABLED=false/);
});
