import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  agenticFooterShellNav,
  agenticShellNav,
  channelShellNav,
  footerShellNav,
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
        "/dashboard/workspace-settings/social-accounts",
      ])
    );
  });
});
