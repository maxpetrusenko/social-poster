import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  getCalendarInsights: vi.fn(),
  getDashboardInsights: vi.fn(),
  getDashboardWorkspaceScope: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {},
}));

vi.mock("@/lib/tenancy", () => ({
  getTenantContext: mocks.getTenantContext,
}));

vi.mock("@/lib/dashboard/insights", () => ({
  getCalendarInsights: mocks.getCalendarInsights,
  getDashboardInsights: mocks.getDashboardInsights,
}));

vi.mock("@/lib/dashboard/workspace-scope", () => ({
  getDashboardWorkspaceScope: mocks.getDashboardWorkspaceScope,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

function tenant() {
  return {
    currentWorkspace: {
      id: "workspace_1",
    },
  };
}

describe("publish route calendar", () => {
  it("defaults to the app-local current month and renders local-day events", async () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T03:30:00.000Z"));
    mocks.getTenantContext.mockResolvedValue(tenant());
    mocks.getDashboardWorkspaceScope.mockResolvedValue({
      postIds: [],
      platformIds: [],
    });
    mocks.getDashboardInsights.mockResolvedValue({
      scheduleInsights: [],
    });
    mocks.getCalendarInsights.mockResolvedValue({
      monthLabel: "May 2026",
      monthStart: new Date("2026-05-01T04:00:00.000Z"),
      monthEnd: new Date("2026-06-01T04:00:00.000Z"),
      eventsByDay: {
        "2026-05-31": [
          {
            id: "late_may",
            dayKey: "2026-05-31",
            at: new Date("2026-06-01T03:30:00.000Z"),
            label: "Late May",
            tone: "completed",
            kind: "run",
          },
        ],
      },
    });

    const { default: PublishPage } = await import("../publish/page");
    const html = renderToStaticMarkup(
      await PublishPage({ searchParams: Promise.resolve({}) })
    );

    expect(mocks.getCalendarInsights).toHaveBeenCalledWith(
      "2026-05",
      "workspace_1"
    );
    expect(html).toContain("Late May");
    expect(html).toContain("11:30 PM");
  });
});
