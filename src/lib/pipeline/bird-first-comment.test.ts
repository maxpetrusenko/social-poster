import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { publishToBird } from "./bird-publisher";

// Fake `bird` runner: logs argv, prints a status URL; `reply` can be forced to fail.
function makeRunner(dir: string) {
  const script = path.join(dir, "fake-bird.sh");
  writeFileSync(
    script,
    `#!/bin/sh
echo "$@" >> "${dir}/calls.log"
for a in "$@"; do
  case "$a" in
    tweet) echo "https://x.com/u/status/111"; exit 0;;
    reply)
      if [ "$FAKE_REPLY_FAIL" = "1" ]; then echo "reply failed: rate limit" >&2; exit 1; fi
      echo "https://x.com/u/status/222"; exit 0;;
  esac
done
exit 2
`
  );
  chmodSync(script, 0o755);
  return script;
}

const platform = {
  id: "p1",
  workspaceId: "w1",
  name: "X",
  type: "twitter",
  handle: "@u",
  accountId: null,
  provider: "bird",
  config: { credentials: { useInstalledBirdSession: true } },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Parameters<typeof publishToBird>[0]["platform"];

describe("bird first comment (X self-reply)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "bird-fc-"));
    process.env.BIRD_RUNNER = makeRunner(dir);
  });
  afterEach(() => {
    delete process.env.BIRD_RUNNER;
    delete process.env.FAKE_REPLY_FAIL;
  });

  it("replies to the returned tweet url and reports the reply id and url", async () => {
    const result = await publishToBird({ platform, content: "main", firstComment: "the link" });
    expect(result.success).toBe(true);
    expect(result.postId).toBe("111");
    expect(result.firstComment).toEqual({
      success: true,
      id: "222",
      url: "https://x.com/u/status/222",
    });
    const calls = readFileSync(path.join(dir, "calls.log"), "utf8");
    expect(calls).toContain("reply --plain https://x.com/u/status/111 the link");
  });

  it("keeps the main post successful and records the error when the reply fails", async () => {
    process.env.FAKE_REPLY_FAIL = "1";
    const result = await publishToBird({ platform, content: "main", firstComment: "the link" });
    expect(result.success).toBe(true);
    expect(result.postUrl).toBe("https://x.com/u/status/111");
    expect(result.firstComment?.success).toBe(false);
    expect(result.firstComment?.error).toMatch(/rate limit/);
  });

  it("does not reply without a firstComment", async () => {
    const result = await publishToBird({ platform, content: "main" });
    expect(result.success).toBe(true);
    expect(result.firstComment).toBeUndefined();
    expect(readFileSync(path.join(dir, "calls.log"), "utf8")).not.toContain("reply");
  });
});
