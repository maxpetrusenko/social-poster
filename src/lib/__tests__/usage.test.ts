import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  organizations: { id: "organization_id", planLabel: "plan_label", maxPostsPerMonth: "max_posts_per_month", billingCycleStart: "billing_cycle_start" },
  usageEvents: { id: "id" },
  workspaces: { id: "workspace_id", organizationId: "organization_id" },
}));

vi.mock("@/lib/notifications/send", () => ({
  sendWorkspaceNotificationEmail: vi.fn(),
}));

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, randomUUID: () => "test-uuid-1234" };
});

import { trackUsage } from "@/lib/usage";
import { db } from "@/db";

describe("trackUsage", () => {
  it("inserts a usage event", async () => {
    await trackUsage("ws-1", "post_published", "platform-1", { postId: "p1" });
    expect(db.insert).toHaveBeenCalled();
  });

  it("works without optional params", async () => {
    await trackUsage("ws-1", "api_call");
    expect(db.insert).toHaveBeenCalled();
  });
});
