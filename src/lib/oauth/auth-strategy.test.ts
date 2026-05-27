import { describe, expect, it } from "vitest";

import {
  defaultAuthStrategy,
  usesAppInstanceToken,
  usesRedirectCallback,
  type AuthStrategy,
} from "./auth-strategy";

describe("auth strategies", () => {
  it("keeps existing oauth methods on redirect callbacks by default", () => {
    expect(defaultAuthStrategy("oauth")).toBe("oauth_authorization_code");
    expect(usesRedirectCallback(defaultAuthStrategy("oauth"))).toBe(true);
  });

  it("keeps manual methods out of redirect callback handling", () => {
    expect(defaultAuthStrategy("manual")).toBe("manual");
    expect(usesRedirectCallback(defaultAuthStrategy("manual"))).toBe(false);
  });

  it("models Wix app-instance auth outside social OAuth callback state", () => {
    const strategy: AuthStrategy = "wix_app_instance";

    expect(usesAppInstanceToken(strategy)).toBe(true);
    expect(usesRedirectCallback(strategy)).toBe(false);
  });
});
