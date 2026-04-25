import { describe, expect, it } from "vitest";

import {
  getAppUrlFromEnv,
  getPublicAppUrlFromEnv,
  normalizeAppUrl,
} from "@/lib/app-url";

describe("app url resolution", () => {
  it("chooses the app domain from a comma-separated APP_URL", () => {
    expect(
      getAppUrlFromEnv({
        APP_URL:
          "https://clawposter.app,https://social.maxpetrusenko.com,https://smmagent.app",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe("https://social.maxpetrusenko.com");
  });

  it("falls back to the first valid origin when the app domain is absent", () => {
    expect(
      normalizeAppUrl("bad-value,https://smmagent.app/path,ftp://invalid.example")
    ).toBe("https://smmagent.app");
  });

  it("uses the canonical app origin for externally fetched media when env is unset", () => {
    expect(getPublicAppUrlFromEnv({} as NodeJS.ProcessEnv)).toBe(
      "https://social.maxpetrusenko.com"
    );
  });

  it("keeps localhost as the regular app url fallback for local app links", () => {
    expect(getAppUrlFromEnv({} as NodeJS.ProcessEnv)).toBe(
      "http://localhost:3000"
    );
  });
});
