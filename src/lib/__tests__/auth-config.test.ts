import { describe, expect, it } from "vitest";
import {
  isBypassSignedOutCookieValue,
  resolveAuthMode,
} from "@/lib/auth-config";

describe("auth config", () => {
  it("does not bypass locally unless auth bypass is explicitly enabled", () => {
    expect(
      resolveAuthMode({
        NODE_ENV: "development",
        DISABLE_AUTH: undefined,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      })
    ).toBe("magic_link");
  });

  it("uses bypass locally only when explicitly enabled", () => {
    expect(
      resolveAuthMode({
        NODE_ENV: "development",
        DISABLE_AUTH: "true",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      })
    ).toBe("bypass");
  });

  it("only treats the explicit bypass marker as signed out", () => {
    expect(isBypassSignedOutCookieValue("1")).toBe(true);
    expect(isBypassSignedOutCookieValue("0")).toBe(false);
    expect(isBypassSignedOutCookieValue(undefined)).toBe(false);
  });
});
