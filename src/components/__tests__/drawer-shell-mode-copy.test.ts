import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/dashboard/drawer-shell.tsx"),
  "utf8"
);

describe("DashboardDrawerShell mode source", () => {
  it("defaults the main dashboard to SaaS navigation and ignores stale agentic storage", () => {
    expect(source).toContain('window.localStorage.removeItem("smmagent.uiPreferences")');
    expect(source).toContain("const isAgenticMode = preferences.productMode === \"agentic\"");
    expect(source).toContain("isAgenticMode ? agenticFooterShellNav : footerShellNav");
    expect(source).toContain("{dashboardItem ? (");
    expect(source).toContain('title="Workspace"');
    expect(source).toContain('title="Channels"');
  });

  it("keeps the agentic dashboard label behind explicit agentic mode", () => {
    expect(source).toContain('title: "Agent"');
    expect(source).toContain("Tell SMM Agent what to plan, draft, review, or fix.");
    expect(source).toContain("agenticShellNav.map");
    expect(source).toContain("preferences.productMode");
  });
});
