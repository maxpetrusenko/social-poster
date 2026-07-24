import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(pathname: string) {
  return readFileSync(join(process.cwd(), pathname), "utf8");
}

describe("legacy signup history copy", () => {
  it("labels historical waitlist data as legacy without deleting its archive", () => {
    const adminPage = source("src/app/admin/waitlist/page.tsx");
    const adminOverview = source("src/app/admin/page.tsx");
    const adminMarketing = source("src/app/admin/marketing/page.tsx");
    const adminShell = source("src/components/admin/admin-shell.tsx");
    const exportRoute = source("src/app/api/admin/waitlist/export/route.ts");

    expect(adminPage).toContain("Signup History");
    expect(adminPage).toContain("Legacy SMM Agent signups and access lists for other brands");
    expect(adminOverview).toContain('label="Signup History"');
    expect(adminMarketing).toContain('<Card label="Signup History"');
    expect(adminShell).toContain('label: "Signup History"');
    expect(exportRoute).toContain('filename="signup-history-');
    expect(adminPage).toContain("waitlistSignups");
    expect(exportRoute).toContain("waitlistSignups");
  });

  it("describes the former waitlist accurately in the privacy policy", () => {
    const privacy = source("src/app/privacy/page.tsx");

    expect(privacy).toContain("If you joined the former SMM Agent waitlist");
    expect(privacy).not.toContain("If you join a waitlist");
  });
});
