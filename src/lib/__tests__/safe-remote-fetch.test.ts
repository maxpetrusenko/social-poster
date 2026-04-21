import { describe, expect, it } from "vitest";

import { isSafeRemoteHttpUrl } from "@/lib/safe-remote-fetch";

describe("safe-remote-fetch", () => {
  it("blocks local and private network URLs", async () => {
    await expect(isSafeRemoteHttpUrl("http://127.0.0.1/admin")).resolves.toBe(false);
    await expect(isSafeRemoteHttpUrl("http://10.0.0.5/image.png")).resolves.toBe(false);
    await expect(isSafeRemoteHttpUrl("http://169.254.169.254/latest/meta-data")).resolves.toBe(false);
    await expect(isSafeRemoteHttpUrl("http://localhost:3000")).resolves.toBe(false);
  });

  it("allows public http and https URLs without credentials", async () => {
    await expect(isSafeRemoteHttpUrl("https://8.8.8.8/image.png")).resolves.toBe(true);
    await expect(isSafeRemoteHttpUrl("http://1.1.1.1")).resolves.toBe(true);
    await expect(isSafeRemoteHttpUrl("https://user:pass@example.com/image.png")).resolves.toBe(false);
  });
});
