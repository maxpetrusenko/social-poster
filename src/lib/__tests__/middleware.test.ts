import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

function requestFor(url: string, cookie?: { name: string; value: string }) {
  const parsed = new URL(url);
  const request = new NextRequest(url, {
    headers: {
      host: parsed.host,
      "x-forwarded-host": parsed.host,
      "x-forwarded-proto": parsed.protocol.replace(":", ""),
    },
  });
  if (cookie) {
    request.cookies.set(cookie.name, cookie.value);
  }
  return request;
}

function dashboardRequest(cookie?: { name: string; value: string }) {
  return requestFor("http://localhost:3000/dashboard/settings", cookie);
}

describe("middleware auth redirects", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("redirects Supabase dashboard requests without an auth cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.maxpetrusenko.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

    const { middleware } = await import("@/middleware");
    const response = await middleware(dashboardRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%2Fsettings"
    );
  });

  it("lets Supabase dashboard requests with a chunked auth cookie reach server auth", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.maxpetrusenko.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

    const { middleware } = await import("@/middleware");
    const response = await middleware(
      dashboardRequest({
        name: "sb-supabase-auth-token.0",
        value: "base64-session",
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects public marketing dashboard traffic to the app host before auth", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_AUTH", "false");

    const { middleware } = await import("@/middleware");
    const response = await middleware(
      requestFor("https://smmagent.app/dashboard?from=landing")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://social.maxpetrusenko.com/dashboard?from=landing"
    );
  });

  it("redirects public marketing login traffic to the app host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_AUTH", "false");

    const { middleware } = await import("@/middleware");
    const response = await middleware(
      requestFor("https://smmagent.app/login?next=%2Fdashboard")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://social.maxpetrusenko.com/login?next=%2Fdashboard"
    );
  });
});
