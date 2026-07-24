import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingNav } from "@/components/landing/nav";
import { SmmAgentHome } from "@/components/landing/smm-home";

function expectLink(name: string, href: string) {
  const link = screen.getByRole("link", { name });
  expect(link.getAttribute("href")).toBe(href);
}

describe("public access calls to action", () => {
  it("routes signed-out desktop and mobile navigation to login", () => {
    render(<LandingNav isLoggedIn={false} accessMode="login" />);

    expectLink("Sign in", "/login");
    expect(screen.queryByText(/waitlist/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const mobileLink = screen.getAllByRole("link", { name: "Sign in" })[1];
    expect(mobileLink.getAttribute("href")).toBe("/login");
  });

  it("routes signed-in navigation to the dashboard", () => {
    render(<LandingNav isLoggedIn accessMode="login" />);

    expectLink("Open SMM Agent", "/dashboard");
  });

  it("preserves the waitlist action for other product brands", () => {
    render(<LandingNav isLoggedIn={false} brandName="ClawPoster" />);

    expectLink("Join Waitlist", "#waitlist");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("wires the SMM Agent root and every blog surface to login mode", () => {
    const appPage = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    const blogIndex = readFileSync(join(process.cwd(), "src/app/blog/page.tsx"), "utf8");
    const blogCategory = readFileSync(
      join(process.cwd(), "src/app/blog/category/[category]/page.tsx"),
      "utf8"
    );
    const blogArticle = readFileSync(
      join(process.cwd(), "src/app/blog/[slug]/page.tsx"),
      "utf8"
    );

    expect(appPage).toContain('brandName="SMM Agent" accessMode="login"');
    expect(appPage).toContain("<SmmAgentHome isLoggedIn={!!session} />");
    for (const source of [blogIndex, blogCategory, blogArticle]) {
      expect(source).toContain('brandName === "SMM Agent" ? "login" : "waitlist"');
    }
  });

  it.each([
    [SmmAgentHome, false, "Start using SMM Agent", "/login"],
    [SmmAgentHome, true, "Open SMM Agent", "/dashboard"],
  ] as const)(
    "%s uses the correct access destination when signed-in is %s",
    (Component, isLoggedIn, label, href) => {
      render(<Component isLoggedIn={isLoggedIn} />);

      expectLink(label, href);
      expect(screen.queryByText(/waitlist/i)).toBeNull();
      expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
    }
  );
});
