import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  agenticFooterShellNav,
  agenticShellNav,
  channelShellNav,
  footerShellNav,
  isShellNavHrefActive,
  type ShellNavItem,
  utilityShellNav,
  workspaceShellNav,
} from "@/lib/dashboard-shell";

function flattenNav(items: ShellNavItem[]): ShellNavItem[] {
  return items.flatMap((item) => [item, ...flattenNav(item.children ?? [])]);
}

function pagePathForHref(href: string) {
  return path.join(process.cwd(), "src/app", href.replace(/^\//, ""), "page.tsx");
}

describe("dashboard navigation", () => {
  it("points every shell nav item at an implemented app route", () => {
    const navItems = flattenNav([
      ...workspaceShellNav,
      ...channelShellNav,
      ...utilityShellNav,
      ...agenticShellNav,
      ...agenticFooterShellNav,
      ...footerShellNav,
    ]);

    const missingRoutes = navItems
      .map((item) => item.href)
      .filter((href, index, hrefs) => hrefs.indexOf(href) === index)
      .filter((href) => !fs.existsSync(pagePathForHref(href)));

    expect(missingRoutes).toEqual([]);
  });

  it("keeps primary operator surfaces reachable from the shell", () => {
    const hrefs = new Set(
      flattenNav([
        ...workspaceShellNav,
        ...channelShellNav,
        ...utilityShellNav,
        ...agenticShellNav,
      ]).map((item) => item.href)
    );

    expect([...hrefs]).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/dashboard/calendar",
        "/dashboard/posts/create",
        "/dashboard/categories",
        "/dashboard/schedules",
        "/dashboard/pipeline",
        "/dashboard/review",
        "/dashboard/analytics",
        "/dashboard/workspace-settings/social-accounts",
      ])
    );
  });

  it("keeps work review surfaces out of the default SaaS utility navigation", () => {
    const defaultUtilityHrefs = new Set(
      flattenNav(utilityShellNav).map((item) => item.href)
    );

    expect(defaultUtilityHrefs.has("/dashboard/review")).toBe(false);
    expect(defaultUtilityHrefs.has("/dashboard/analytics")).toBe(false);
  });

  it("keeps the live website preview inside the Article Generation submenu", () => {
    const articleGeneration = workspaceShellNav.find(
      (item) => item.href === "/dashboard/articles"
    );

    expect(articleGeneration?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Website Preview",
          href: "/dashboard/articles/preview",
        }),
      ])
    );
  });

  it("does not mark the Articles index child active while Website Preview is open", () => {
    expect(
      isShellNavHrefActive(
        "/dashboard/articles/preview",
        "/dashboard/articles",
        true
      )
    ).toBe(false);
    expect(
      isShellNavHrefActive(
        "/dashboard/articles/preview",
        "/dashboard/articles/preview"
      )
    ).toBe(true);
  });
});
