import test from "node:test";
import assert from "node:assert/strict";
import {
  filterUntriedReplyDrafts,
  isDuplicateReplyError,
  normalizeReplyText,
  uniqueReplyDrafts,
} from "./duplicate-guard.ts";

test("uniqueReplyDrafts trims and removes duplicate variants", () => {
  const drafts = uniqueReplyDrafts([
    "nice. curious where you take it next",
    " nice. curious   where you take it next ",
    "do it. would love to see what you make",
  ]);

  assert.deepEqual(drafts, [
    "nice. curious where you take it next",
    "do it. would love to see what you make",
  ]);
});

test("filterUntriedReplyDrafts blocks drafts already attempted for the same tweet", () => {
  const drafts = filterUntriedReplyDrafts(
    [
      "nice. curious where you take it next",
      "do it. would love to see what you make",
      "yeah this is where it gets interesting",
    ],
    [" Nice. curious where you take it next ", "DO IT. would love to see what you make"]
  );

  assert.deepEqual(drafts, ["yeah this is where it gets interesting"]);
});

test("isDuplicateReplyError catches X duplicate failures", () => {
  assert.equal(
    isDuplicateReplyError(
      "Failed to post reply: Authorization: Status is a duplicate. (187) (187)"
    ),
    true
  );
  assert.equal(isDuplicateReplyError("network timeout"), false);
  assert.equal(normalizeReplyText("  Hello   There "), "hello there");
});
