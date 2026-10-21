import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { platforms: { findFirst: mocks.findFirst } },
    update: () => ({
      set: (value: unknown) => {
        mocks.set(value);
        return { where: mocks.where };
      },
    }),
  },
}));

import {
  classifyAuthFailure,
  readConnectionIssue,
  resolveConnectionStatus,
} from "@/lib/platform-connection-state";
import {
  clearPlatformAuthFailure,
  markPlatformAuthFailure,
  recordAuthFailureFromError,
} from "@/lib/platform-auth-status";

describe("classifyAuthFailure", () => {
  it("treats Graph error 190 as token_expired", () => {
    expect(
      classifyAuthFailure({
        message: "Instagram API error 400",
        raw: { error: { code: 190, type: "OAuthException" } },
      })
    ).toBe("token_expired");
    expect(
      classifyAuthFailure({ message: 'API error 400: {"error":{"message":"x","code":190}}' })
    ).toBe("token_expired");
  });

  it("treats 401/403 as token_expired and Zernio disconnected as disconnected", () => {
    expect(classifyAuthFailure({ message: "nope", statusCode: 401 })).toBe("token_expired");
    expect(classifyAuthFailure({ message: "nope", statusCode: 403 })).toBe("token_expired");
    expect(classifyAuthFailure({ message: "Account disconnected, reconnect it" })).toBe("disconnected");
  });

  it("ignores unrelated failures", () => {
    expect(classifyAuthFailure({ message: "media too large", statusCode: 400 })).toBeNull();
    expect(classifyAuthFailure({ message: "rate limit", statusCode: 429 })).toBeNull();
  });
});

describe("resolveConnectionStatus", () => {
  const now = 1_000_000;
  it("prefers observed issues over a future expiry", () => {
    const config = { connectionIssue: { status: "token_expired", reason: "x", at: "t" } };
    expect(resolveConnectionStatus(config, now + 5000, now)).toBe("token_expired");
    expect(readConnectionIssue(config)?.status).toBe("token_expired");
  });

  it("keeps disconnectedAt and expiry behavior", () => {
    expect(resolveConnectionStatus({ disconnectedAt: "2026-01-01" }, null, now)).toBe("disconnected");
    expect(resolveConnectionStatus({}, now - 1, now)).toBe("token_expired");
    expect(resolveConnectionStatus({}, now + 1, now)).toBe("connected");
    expect(resolveConnectionStatus(null, null, now)).toBe("connected");
  });
});

describe("platform auth status persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "p1", config: { credentials: { a: 1 } } });
  });

  it("writes the issue next to existing config", async () => {
    await markPlatformAuthFailure("p1", "token_expired", "boom", new Date("2026-10-21T00:00:00Z"));
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const config = mocks.set.mock.calls[0][0].config;
    expect(config.credentials).toEqual({ a: 1 });
    expect(config.connectionIssue).toEqual({
      status: "token_expired",
      reason: "boom",
      at: "2026-10-21T00:00:00.000Z",
    });
  });

  it("does not rewrite an identical issue", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "p1",
      config: { connectionIssue: { status: "token_expired", reason: "boom", at: "t" } },
    });
    await markPlatformAuthFailure("p1", "token_expired", "boom");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("clears a recorded issue and leaves clean rows alone", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "p1",
      config: { credentials: { a: 1 }, connectionIssue: { status: "disconnected", reason: "", at: "" } },
    });
    await clearPlatformAuthFailure("p1");
    expect(mocks.set.mock.calls[0][0].config).toEqual({ credentials: { a: 1 } });

    mocks.set.mockClear();
    mocks.findFirst.mockResolvedValue({ id: "p1", config: {} });
    await clearPlatformAuthFailure("p1");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("records from an auth_error classification and skips non-auth errors", async () => {
    expect(
      await recordAuthFailureFromError("p1", { message: "Native provider missing access token.", classification: "auth_error" })
    ).toBe("token_expired");
    expect(
      await recordAuthFailureFromError("p1", { message: "Zernio: account disconnected", classification: "provider_error" })
    ).toBe("disconnected");
    mocks.set.mockClear();
    expect(
      await recordAuthFailureFromError("p1", { message: "too long", classification: "validation_error" })
    ).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
