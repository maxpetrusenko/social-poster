import { afterEach, describe, expect, it, vi } from "vitest";

describe("supabase config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses public Supabase URL for browser clients", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.maxpetrusenko.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "http://supabase-kong:8000");

    const { getSupabasePublicEnv } = await import("@/lib/supabase/config");

    expect(getSupabasePublicEnv()).toEqual({
      url: "https://supabase.maxpetrusenko.com",
      anonKey: "anon",
    });
  });

  it("uses internal Supabase URL for server clients with public cookie key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.maxpetrusenko.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "http://supabase-kong:8000");

    const { getSupabaseServerEnv } = await import("@/lib/supabase/config");

    expect(getSupabaseServerEnv()).toEqual({
      url: "http://supabase-kong:8000",
      anonKey: "anon",
      storageKey: "sb-supabase-auth-token",
    });
  });
});
