import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  getCalendarInsights: vi.fn(),
  calendarControls: vi.fn(),
  calendarSurface: vi.fn(),
}));

vi.mock("@/lib/tenancy", () => ({
  getTenantContext: mocks.getTenantContext,
}));

vi.mock("@/lib/dashboard/calendar", () => ({
  getCalendarInsights: mocks.getCalendarInsights,
}));

vi.mock("@/components/dashboard/calendar-controls", () => ({
  CalendarControls: (props: Record<string, unknown>) => {
    mocks.calendarControls(props);
    return <div data-testid="calendar-controls">{String(props.monthLabel)}</div>;
  },
}));

vi.mock("@/components/dashboard/calendar-event-surface", () => ({
  CalendarEventSurface: (props: Record<string, unknown>) => {
    mocks.calendarSurface(props);
    return <div data-testid="calendar-surface">{String(props.todayKey)}</div>;
  },
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

describe("dashboard calendar route", () => {
  it("defaults to the app-local current month at UTC month rollover", async () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T03:30:00.000Z"));
    mocks.getTenantContext.mockResolvedValue(tenant());
    mocks.getCalendarInsights.mockResolvedValue({
      monthLabel: "May 2026",
      monthStart: new Date("2026-05-01T04:00:00.000Z"),
      monthEnd: new Date("2026-06-01T04:00:00.000Z"),
      eventsByDay: {},
    });

    const { default: CalendarPage } = await import("../calendar/page");
    renderToStaticMarkup(
      await CalendarPage({ searchParams: Promise.resolve({}) })
    );

    expect(mocks.getCalendarInsights).toHaveBeenCalledWith(
      "2026-05",
      "workspace_1"
    );
    expect(mocks.calendarSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        todayKey: "2026-05-31",
        days: expect.arrayContaining(["2026-05-31"]),
      })
    );
    expect(mocks.calendarControls).toHaveBeenCalledWith(
      expect.objectContaining({
        todayMonth: "2026-05",
      })
    );
  });

  it("preserves local-day event keys through route filtering and serialization", async () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T03:30:00.000Z"));
    mocks.getTenantContext.mockResolvedValue(tenant());
    mocks.getCalendarInsights.mockResolvedValue({
      monthLabel: "May 2026",
      monthStart: new Date("2026-05-01T04:00:00.000Z"),
      monthEnd: new Date("2026-06-01T04:00:00.000Z"),
      eventsByDay: {
        "2026-05-31": [
          {
            id: "event_1",
            dayKey: "2026-05-31",
            at: new Date("2026-06-01T03:30:00.000Z"),
            label: "Late May",
            preview: "Launch",
            content: "Launch",
            mediaUrl: null,
            error: null,
            tone: "completed",
            kind: "post",
            href: "/dashboard/posts/post_1",
            tooltip: "Late May",
            platforms: [
              {
                id: "twitter",
                type: "twitter",
                label: "X",
                shortLabel: "X",
                accent: "#111111",
                formatCode: null,
                status: "success",
                handle: null,
                content: "Launch",
                mediaUrl: null,
                contentType: "text",
                publishedUrl: null,
                sourceUrl: null,
                sourceHost: null,
                firstComment: null,
                error: null,
              },
            ],
            media: [{ code: "T", label: "Text" }],
            tags: ["Launch"],
            debug: {
              eventId: "event_1",
              runId: null,
              scheduleId: null,
              postId: "post_1",
              attemptCount: 1,
              forecast: false,
              sourceUrl: null,
              sourceHost: null,
              imageUrl: null,
            },
          },
        ],
      },
    });

    const { default: CalendarPage } = await import("../calendar/page");
    renderToStaticMarkup(
      await CalendarPage({
        searchParams: Promise.resolve({
          view: "list",
          status: "posted",
          platform: "twitter",
          media: "text",
          tag: "Launch",
        }),
      })
    );

    expect(mocks.calendarSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        view: "list",
        eventsByDay: {
          "2026-05-31": [
            expect.objectContaining({
              id: "event_1",
              at: "2026-06-01T03:30:00.000Z",
            }),
          ],
        },
        groupedDayKeys: ["2026-05-31"],
      })
    );
  });
});
