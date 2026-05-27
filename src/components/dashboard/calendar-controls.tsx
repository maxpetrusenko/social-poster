"use client";

import { ChevronLeft, ChevronRight, List, RefreshCcw, Rows3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { getCurrentCalendarMonth } from "@/lib/dashboard/calendar-month";

type Option = {
  value: string;
  label: string;
};

function ControlSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Option[];
  onChange: (nextValue: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] shadow-[0_8px_24px_rgba(12,17,21,0.05)]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function CalendarControls({
  monthLabel,
  prevMonth,
  nextMonth,
  todayMonth,
  view,
  status,
  media,
  platform,
  tag,
  statusOptions,
  mediaOptions,
  platformOptions,
  tagOptions,
}: {
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  todayMonth: string;
  view: "calendar" | "list";
  status: string;
  media: string;
  platform: string;
  tag: string;
  statusOptions: Option[];
  mediaOptions: Option[];
  platformOptions: Option[];
  tagOptions: Option[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const refreshCalendar = async () => {
    await fetch("/api/scheduler/reconcile", { method: "POST" });
    router.refresh();
  };

  const pushWith = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    next.delete("open");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="space-y-3 lg:min-w-[420px]">
      <div className="flex flex-col gap-3 lg:items-end">
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => pushWith({ month: prevMonth })}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] shadow-[0_8px_24px_rgba(12,17,21,0.05)]"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => pushWith({ month: nextMonth })}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] shadow-[0_8px_24px_rgba(12,17,21,0.05)]"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-right shadow-[0_8px_24px_rgba(12,17,21,0.05)]">
            <p className="text-sm font-semibold text-[var(--ink)]">{monthLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => pushWith({ month: getCurrentCalendarMonth() || todayMonth })}
            className="rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)] shadow-[0_8px_24px_rgba(12,17,21,0.05)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={refreshCalendar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] shadow-[0_8px_24px_rgba(12,17,21,0.05)]"
            aria-label="Refresh calendar"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>

          <div className="inline-flex items-center gap-1 rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-white p-1 shadow-[0_8px_24px_rgba(12,17,21,0.05)]">
            <button
              type="button"
              onClick={() => pushWith({ view: "list" })}
              className={cn(
                "inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold transition",
                view === "list"
                  ? "bg-[rgba(12,17,21,0.08)] text-[var(--ink)]"
                  : "text-[var(--muted)]"
              )}
            >
              <List className="h-4 w-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => pushWith({ view: "calendar" })}
              className={cn(
                "inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold transition",
                view === "calendar"
                  ? "bg-[rgba(210,163,93,0.16)] text-[var(--ink)]"
                  : "text-[var(--muted)]"
              )}
            >
              <Rows3 className="h-4 w-4" />
              Calendar
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <ControlSelect value={status} options={statusOptions} onChange={(value) => pushWith({ status: value })} />
        <ControlSelect value={media} options={mediaOptions} onChange={(value) => pushWith({ media: value })} />
        <ControlSelect value={platform} options={platformOptions} onChange={(value) => pushWith({ platform: value })} />
        <ControlSelect value={tag} options={tagOptions} onChange={(value) => pushWith({ tag: value })} />
      </div>
    </div>
  );
}
