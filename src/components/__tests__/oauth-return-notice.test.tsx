import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OAuthReturnNoticeBanner } from "@/components/dashboard/oauth-return-notice";
import { resolveOAuthReturnNotice } from "@/lib/providers/oauth-return";

describe("OAuth return notice", () => {
  it("names the handle of the connected row when two Instagram accounts exist", () => {
    const rows = { "row-a": "@first", "row-b": "@second" };
    const notice = resolveOAuthReturnNotice(
      { connected: "instagram", platformId: "row-b" },
      rows
    );
    render(<OAuthReturnNoticeBanner notice={notice} />);
    expect(screen.getByRole("status").textContent).toBe("Instagram connected as @second");
  });

  it("ignores an unknown platformId", () => {
    const notice = resolveOAuthReturnNotice(
      { connected: "instagram", platformId: "__proto__" },
      { "row-a": "@first" }
    );
    expect(notice?.message).toBe("Instagram connected");
  });

  it.each(["__proto__", "constructor", "toString", "some free text"])(
    "maps unknown error %s to the generic message",
    (value) => {
      const notice = resolveOAuthReturnNotice({ error: value });
      expect(notice).toEqual({
        kind: "error",
        message: "Connecting the account failed. Try again.",
      });
    }
  );

  it("renders a success notice with the handle", () => {
    const notice = resolveOAuthReturnNotice(
      { connected: "instagram", platformId: "row-a" },
      { "row-a": "@maxpetrusenko" }
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
