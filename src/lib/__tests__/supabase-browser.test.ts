import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn((url: string, anonKey: string) => ({
    anonKey,
    url,
  })),
}));

describe("supabase browser client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses explicit runtime config when public env was not bundled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const { createSupabaseBrowserClient } = await import(
      "@/lib/supabase/browser"
    );

    expect(
      createSupabaseBrowserClient({
        url: "https://supabase.maxpetrusenko.com",
        anonKey: "anon",
      })
    ).toEqual({
      url: "https://supabase.maxpetrusenko.com",
      anonKey: "anon",
    });
  });

  it("falls back to bundled public env when runtime config is omitted", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "env-anon");

    const { createSupabaseBrowserClient } = await import(
      "@/lib/supabase/browser"
    );

    expect(createSupabaseBrowserClient()).toEqual({
      url: "https://supabase.example.com",
      anonKey: "env-anon",
    });
  });
});
