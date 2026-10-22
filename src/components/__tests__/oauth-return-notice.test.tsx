import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OAuthReturnNoticeBanner } from "@/components/dashboard/oauth-return-notice";
import { resolveOAuthReturnNotice } from "@/lib/providers/oauth-return";

describe("OAuth return notice", () => {
  it("renders a success notice with the handle", () => {
    const notice = resolveOAuthReturnNotice(
      { connected: "instagram" },
      { instagram: "@maxpetrusenko" }
    );
    render(<OAuthReturnNoticeBanner notice={notice} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Instagram connected as @maxpetrusenko"
    );
  });

  it("renders a success notice without a handle", () => {
    const notice = resolveOAuthReturnNotice({ connected: "instagram" });
    render(<OAuthReturnNoticeBanner notice={notice} />);
    expect(screen.getByRole("status").textContent).toBe("Instagram connected");
  });

  it.each([
    ["instagram_profile_unreadable", "profile could not be read"],
    ["token_rejected", "rejected the sign-in"],
    ["invalid_state", "Try connecting again"],
  ])("renders a human error for %s", (code, fragment) => {
    const notice = resolveOAuthReturnNotice({ error: code });
    render(<OAuthReturnNoticeBanner notice={notice} />);
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toContain(fragment);
    expect(alert).not.toContain(code);
  });

  it("renders nothing for unrelated params", () => {
    expect(resolveOAuthReturnNotice({ connected: "bogus" })).toBeNull();
  });
});
