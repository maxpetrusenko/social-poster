import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildWorkspaceInvitationEmail,
  getInvitationUrl,
  hasEmailDeliveryConfig,
  hasSmtpConfig,
  sendWorkspaceInvitationEmail,
} from "@/lib/mail";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("workspace invitation email", () => {
  it("uses SMM Agent access copy without exposing the inviter", () => {
    vi.stubEnv("APP_URL", "https://social.maxpetrusenko.com");

    const email = buildWorkspaceInvitationEmail({
      token: "invite-token",
      baseUrl: "https://wrong.example.com",
    });

    expect(email.subject).toBe("Your SMM Agent access is ready");
    expect(email.url).toBe("https://social.maxpetrusenko.com/invite/invite-token");
    expect(email.html).toContain("Start using SMM Agent");
    expect(email.html).toContain(
      "Use this link to sign in and access your SMM Agent workspace."
    );
    expect(email.html).toContain("This link expires in 7 days.");
    expect(email.html).toContain("Open SMM Agent");
    expect(email.html).not.toContain("collaborate");
    expect(email.html).not.toContain("invited you");
    expect(email.html).not.toContain("max.petrusenko@gmail.com");
  });

  it("normalizes malformed comma-separated production app urls", () => {
    vi.stubEnv(
      "APP_URL",
      "https://social.maxpetrusenko.com,https://social-origin.maxpetrusenko.com"
    );

    expect(getInvitationUrl("token")).toBe(
      "https://social.maxpetrusenko.com/invite/token"
    );
  });

  it("recognizes legacy EMAIL smtp env names", () => {
    vi.stubEnv("EMAIL_HOST_USER", "smtp@example.com");
    vi.stubEnv("EMAIL_HOST_PASSWORD", "app-password");

    expect(hasSmtpConfig()).toBe(true);
    expect(hasEmailDeliveryConfig()).toBe(true);
  });

  it("returns preview delivery when no email provider is configured", async () => {
    vi.stubEnv("APP_URL", "https://social.maxpetrusenko.com");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("EMAIL_HOST_USER", "");
    vi.stubEnv("EMAIL_HOST_PASSWORD", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendWorkspaceInvitationEmail({
      email: "user@example.com",
      token: "invite-token",
      organizationName: "SMM Agent",
      inviterName: "Max",
    });

    expect(result.provider).toBe("preview");
    expect(info).toHaveBeenCalledWith(
      "Workspace invite for user@example.com: https://social.maxpetrusenko.com/invite/invite-token"
    );
  });

  it("ignores placeholder from addresses before using Resend", async () => {
    vi.stubEnv("APP_URL", "https://social.maxpetrusenko.com");
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("DEFAULT_FROM_EMAIL", "noreply@yourdomain.com");
    const fetchMock = vi.fn(async (...args: unknown[]) => {
      void args;
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWorkspaceInvitationEmail({
      email: "user@example.com",
      token: "invite-token",
      organizationName: "SMM Agent",
      inviterName: "Max",
    });

    expect(result).toEqual({ provider: "resend", externalMessageId: "email_123" });
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(JSON.parse(String(calls[0][1].body)).from).toBe("onboarding@resend.dev");
  });
});
