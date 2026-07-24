import { beforeEach, describe, expect, it, vi } from "vitest";

const onConflictDoNothing = vi.fn(async () => undefined);
const values = vi.fn(() => ({ onConflictDoNothing }));
const insert = vi.fn(() => ({ values }));

vi.mock("@/db", () => ({
  db: { insert },
}));

describe("retired waitlist API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["smmagent.app", "social.maxpetrusenko.com"])(
    "returns a terminal response on SMM Agent host %s without storing the submitted email",
    async (host) => {
    const { POST } = await import("@/app/api/waitlist/route");
    const response = await POST(
      new Request("https://smmagent.app/api/waitlist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": host,
        },
        body: JSON.stringify({ email: "reader@example.com", source: "blog" }),
      }) as never
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Waitlist registration is closed. Sign in to use SMM Agent.",
      loginUrl: "/login",
    });
    expect(insert).not.toHaveBeenCalled();
    }
  );

  it("preserves signup collection for another product brand", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const response = await POST(
      new Request("https://clawposter.app/api/waitlist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "clawposter.app",
        },
        body: JSON.stringify({ email: "reader@example.com", source: "blog" }),
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "reader@example.com",
        source: "clawposter.app:blog",
      })
    );
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("rejects an invalid email on another product waitlist", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const response = await POST(
      new Request("https://clawposter.app/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", source: "hero" }),
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Valid email required" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns a safe error when another product signup cannot be stored", async () => {
    insert.mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });
    const { POST } = await import("@/app/api/waitlist/route");
    const response = await POST(
      new Request("https://clawposter.app/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "reader@example.com", source: "hero" }),
      }) as never
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Something went wrong" });
  });
});
