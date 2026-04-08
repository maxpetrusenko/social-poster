import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardHero, HeroButton, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { getCalendarInsights } from "@/lib/dashboard/insights";

function getCalendarDays(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: Array<Date | null> = [];
  for (let index = 0; index < startingDayOfWeek; index += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) days.push(new Date(year, monthIndex, day));
  return days;
}

function toneClass(tone: "planned" | "completed" | "failed" | "running") {
  if (tone === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "running") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const monthParam = params.month || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = monthParam.split("-");
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;

  const prevMonthStr = new Date(year, monthIndex - 1, 1).toISOString().slice(0, 7);
  const nextMonthStr = new Date(year, monthIndex + 1, 1).toISOString().slice(0, 7);
  const calendar = await getCalendarInsights(monthParam);
  const days = getCalendarDays(year, monthIndex);
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Calendar"
        title="Cadence across the month"
        description="Planned schedule slots and actual run results in one grid. Gray = scheduled. Green = landed. Red = failed."
        actions={
          <>
            <HeroButton href={`/dashboard/calendar?month=${prevMonthStr}`} tone="ghost">Prev</HeroButton>
            <HeroButton href={`/dashboard/calendar?month=${nextMonthStr}`} tone="ghost">Next</HeroButton>
          </>
        }
      />

      <SectionCard
        title={calendar.monthLabel}
        subtitle="Calendar now reads schedule recurrence plus real pipeline runs."
        action={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/calendar?month=${prevMonthStr}`} className="rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link href={`/dashboard/calendar`} className="rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
              Today
            </Link>
            <Link href={`/dashboard/calendar?month=${nextMonthStr}`} className="rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge tone="neutral">scheduled</StatusBadge>
          <StatusBadge tone="good">completed</StatusBadge>
          <StatusBadge tone="bad">failed</StatusBadge>
          <StatusBadge tone="warn">running</StatusBadge>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[rgba(12,17,21,0.08)]">
          <div className="grid grid-cols-7 border-b border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.04)]">
            {labels.map((label) => (
              <div key={label} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="min-h-40 border-r border-b border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)]" />;
              }

              const key = day.toISOString().slice(0, 10);
              const events = calendar.eventsByDay[key] || [];

              return (
                <div
                  key={key}
                  className="min-h-40 border-r border-b border-[rgba(12,17,21,0.08)] bg-white/82 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--ink)]">{day.getDate()}</span>
                    {events.length > 0 ? (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {events.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    {events.slice(0, 4).map((event) => (
                      <div
                        key={event.id}
                        className={`rounded-[10px] border px-2 py-1.5 text-[11px] font-medium ${toneClass(event.tone)}`}
                        title={event.label}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{event.label}</span>
                          <span className="shrink-0 opacity-70">
                            {event.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                    {events.length > 4 ? (
                      <div className="px-1 text-[11px] font-semibold text-[var(--muted)]">
                        +{events.length - 4} more
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
