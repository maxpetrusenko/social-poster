import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  host: "smmagent.app",
  getSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-host": mocks.host,
    }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/components/landing/nav", () => ({
  LandingNav: () => null,
}));

vi.mock("@/components/landing/hero", () => ({
  HeroSection: () => null,
}));

vi.mock("@/components/landing/who-is-this-for", () => ({
  WhoIsThisFor: () => null,
}));

vi.mock("@/components/landing/how-it-works", () => ({
  HowItWorks: () => null,
}));

vi.mock("@/components/landing/features", () => ({
  FeaturesGrid: () => null,
}));

vi.mock("@/components/landing/cta-section", () => ({
  CtaSection: () => null,
}));

vi.mock("@/components/landing/footer", () => ({
  LandingFooter: () => null,
}));

vi.mock("@/components/landing/smm-home", () => ({
  SmmAgentHome: () => null,
  SmmHome: () => null,
}));

afterEach(() => {
  mocks.host = "smmagent.app";
  mocks.getSession.mockReset();
  mocks.redirect.mockReset();
  vi.resetModules();
});

function throwRedirect(path: string) {
  throw new Error(`redirect:${path}`);
}

describe("root app host transition", () => {
  it("preserves the SMM Agent marketing page at the canonical app root", async () => {
    mocks.host = "smmagent.app";
    mocks.getSession.mockResolvedValue(null);

    const { default: HomePage } = await import("@/app/page");
    await expect(HomePage()).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps the legacy app root on its login/dashboard behavior", async () => {
    mocks.host = "social.maxpetrusenko.com";
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.redirect.mockImplementation(throwRedirect);

    const { default: HomePage } = await import("@/app/page");

    await expect(HomePage()).rejects.toThrow("redirect:/dashboard");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it.each(["smmagent.app", "social.maxpetrusenko.com"])(
    "uses smmagent.app metadata for app host %s",
    async (host) => {
      mocks.host = host;

      const { generateMetadata } = await import("@/app/page");
      const metadata = await generateMetadata();

      expect(metadata.alternates?.canonical).toBe("https://smmagent.app/");
      expect(metadata.openGraph?.url).toBe("https://smmagent.app/");
    }
  );

  it.each([
    ["smmclaw.app", "https://smmclaw.app/"],
    ["clawposter.app", "https://clawposter.app/"],
  ])("keeps marketing metadata unchanged for %s", async (host, canonical) => {
    mocks.host = host;

    const { generateMetadata } = await import("@/app/page");
    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe(canonical);
  });
});
