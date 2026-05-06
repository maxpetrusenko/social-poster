import { describe, expect, it } from "vitest";
import {
  DISCONNECTED_CONNECTION_FLAG,
  isPlatformConnectionDisconnected,
} from "@/lib/platform-connection-state";

describe("platform connection disconnect markers", () => {
  it("treats proxy accounts with a disconnect timestamp as hidden from sync", () => {
    expect(
      isPlatformConnectionDisconnected({
        [DISCONNECTED_CONNECTION_FLAG]: "2026-04-29T20:00:00.000Z",
      })
    ).toBe(true);
  });

  it("does not treat missing or blank disconnect markers as disconnected", () => {
    expect(isPlatformConnectionDisconnected(null)).toBe(false);
    expect(isPlatformConnectionDisconnected({})).toBe(false);
    expect(isPlatformConnectionDisconnected({ [DISCONNECTED_CONNECTION_FLAG]: " " })).toBe(false);
  });
});
