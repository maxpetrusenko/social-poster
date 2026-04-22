import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_MODE,
  PRODUCT_MODES,
  UI_PREFERENCES_STORAGE_KEY,
  parseProductMode,
} from "@/lib/user-preferences";

describe("user preferences", () => {
  it("keeps the SaaS dashboard as the default product mode", () => {
    expect(DEFAULT_PRODUCT_MODE).toBe("saas");
    expect(PRODUCT_MODES[0]).toBe("saas");
    expect(parseProductMode(undefined)).toBe("saas");
    expect(parseProductMode("unknown")).toBe("saas");
  });

  it("uses a versioned storage key so stale agentic state is ignored", () => {
    expect(UI_PREFERENCES_STORAGE_KEY).toBe("smmagent.uiPreferences.v2");
  });
});
