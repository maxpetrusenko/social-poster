import { describe, expect, it } from "vitest";

import {
  APP_DOMAIN_TRANSITION_MODE,
  SITE_DOMAINS,
  getAppHostKind,
  getRedirectHost,
  isAppHost,
} from "@/lib/site-domains";

describe("site domain transition", () => {
  it("makes smmagent.app the canonical app host", () => {
    expect(SITE_DOMAINS.app).toBe("smmagent.app");
    expect(getAppHostKind("smmagent.app")).toBe("canonical");
  });

  it("keeps social.maxpetrusenko.com as an explicit dual-host legacy app", () => {
    expect(APP_DOMAIN_TRANSITION_MODE).toBe("dual-host");
    expect(getAppHostKind("social.maxpetrusenko.com")).toBe("legacy");
    expect(isAppHost("social.maxpetrusenko.com")).toBe(true);
  });

  it("redirects www app aliases to the canonical app host", () => {
    expect(getRedirectHost("www.smmagent.app")).toBe("smmagent.app");
    expect(getRedirectHost("www.social.maxpetrusenko.com")).toBe(
      "smmagent.app"
    );
  });
});
