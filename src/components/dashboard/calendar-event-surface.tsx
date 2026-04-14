"use client";

import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PlatformIconMarker } from "@/components/dashboard/platform-icon";
import { StatusBadge } from "@/components/dashboard/ui";
import { formatTimeInZone } from "@/lib/timezone";

export type CalendarSurfaceEvent = {
  id: string;
  dayKey: string;
  at: string;
  label: string;
  preview: string | null;
  content: string | null;
  mediaUrl: string | null;
  tone: "planned" | "completed" | "failed" | "running" | "blocked";
  kind: "schedule" | "run" | "post";
  href: string | null;
  tooltip: string;
  platforms: Array<{
    id: string;
    type: string;
    label: string;
    shortLabel: string;
    formatCode: "P" | "S" | "R" | "C" | "L" | "T" | null;
  }>;
  media: Array<{
    code: "T" | "I" | "V";
    label: string;
  }>;
  tags: string[];
};

function toneClass(event: CalendarSurfaceEvent) {
  if (event.tone === "blocked") {
    return "border-stone-100 bg-stone-50/70 text-stone-400";
  }

  if (event.kind === "schedule" && event.tone === "planned") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (event.tone === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (event.tone === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (event.tone === "running") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-100 text-slate-800";
}

function previewShellClass(event: CalendarSurfaceEvent) {
  if (event.tone === "completed") return "border-emerald-200";
  if (event.tone === "failed") return "border-red-200";
  if (event.tone === "running") return "border-amber-200";
  if (event.tone === "blocked") return "border-stone-200";
  if (event.kind === "schedule" && event.tone === "planned") return "border-sky-200";
  return "border-slate-200";
}

function toneBadge(tone: CalendarSurfaceEvent["tone"]) {
  if (tone === "blocked") return "blocked";
  if (tone === "completed") return "good";
  if (tone === "failed") return "bad";
  if (tone === "running") return "warn";
  return "neutral";
}

function eventStatusLabel(tone: CalendarSurfaceEvent["tone"]) {
  if (tone === "blocked") return "Paused";
  if (tone === "completed") return "Posted";
  if (tone === "failed") return "Failed";
  if (tone === "running") return "Running";
  return "Scheduled";
}

function eventKindLabel(kind: CalendarSurfaceEvent["kind"]) {
  if (kind === "post") return "Post";
  if (kind === "run") return "Run";
  return "Auto";
}

function firstLine(value: string | null | undefined) {
  if (!value) return "";
  const line = value
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? "";
}

function mediaBadgeCode(event: CalendarSurfaceEvent) {
  const order = { T: 0, I: 1, V: 2 } as const;

  return (
    event.media
      .map((media) => media.code)
      .sort((left, right) => order[left] - order[right])
      .join("") || "T"
  );
}

function platformBadgeCode(
  event: CalendarSurfaceEvent,
  platform: CalendarSurfaceEvent["platforms"][number] | null
) {
  if (!platform) return mediaBadgeCode(event);
  if (platform.formatCode === "T") return "Th";
  if (platform.formatCode) return platform.formatCode;
  return mediaBadgeCode(event);
}

function formatDayLabel(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function EventRow({
  event,
  expanded,
  onToggleExpand,
  onOpenPreview,
}: {
  event: CalendarSurfaceEvent;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenPreview: () => void;
}) {
  const lead = firstLine(event.content || event.preview || event.label);
  const hasVideo = event.media.some((media) => media.code === "V");
  const canExpand = Boolean(event.content && firstLine(event.content) !== event.content.trim());
  const rowPlatforms = event.platforms.slice(0, 3);

  return (
    <div className={`rounded-[10px] border transition hover:shadow-[0_10px_24px_rgba(12,17,21,0.08)] ${toneClass(event)}`}>
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onOpenPreview}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          title={event.tooltip}
        >
          {rowPlatforms.length > 0 ? (
            <span className="-space-x-1 flex shrink-0 items-center pt-0.5">
              {rowPlatforms.map((platform) => (
                <PlatformIconMarker
                  key={`${event.id}-${platform.id}-row`}
                  type={platform.type}
                  badgeLabel={platformBadgeCode(event, platform)}
                  label={platform.label}
                  className="ring-2 ring-white"
                />
              ))}
            </span>
          ) : null}
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">
            {formatTimeInZone(event.at)} {mediaBadgeCode(event)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
            {lead || event.label}
          </span>
          {hasVideo ? <span className="shrink-0 text-xs">🎥</span> : null}
        </button>

        {canExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse post text" : "Expand post text"}
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : null}
      </div>

      {canExpand && expanded ? (
        <div className="border-t border-current/10 px-2.5 pb-2.5 pt-2 text-[10px] leading-4 opacity-80">
          <p className="whitespace-pre-wrap">{event.content}</p>
        </div>
      ) : null}
    </div>
  );
}

function EventDetailRow({
  event,
  onOpenPreview,
}: {
  event: CalendarSurfaceEvent;
  onOpenPreview: () => void;
}) {
  const hasVideo = event.media.some((media) => media.code === "V");
  const lead = firstLine(event.content || event.preview || event.label);

  return (
    <button
      type="button"
      onClick={onOpenPreview}
      className={`block w-full rounded-[18px] border px-4 py-4 text-left ${toneClass(event)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={toneBadge(event.tone)}>
              {eventStatusLabel(event.tone)}
            </StatusBadge>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
              {eventKindLabel(event.kind)}
            </span>
            <span className="text-xs opacity-70">{formatTimeInZone(event.at)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-sm font-semibold">{lead || event.label}</p>
            {hasVideo ? <span className="text-sm">🎥</span> : null}
          </div>
          {event.preview ? (
            <p className="mt-2 text-sm leading-6 opacity-85">{event.preview}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function CalendarEventSurface({
  view,
  labels,
  days,
  eventsByDay,
  groupedDayKeys,
  todayKey,
}: {
  view: "calendar" | "list";
  labels: string[];
  days: Array<string | null>;
  eventsByDay: Record<string, CalendarSurfaceEvent[]>;
  groupedDayKeys: string[];
  todayKey: string;
}) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);

  const allEvents = useMemo(
    () => Object.values(eventsByDay).flat(),
    [eventsByDay]
  );

  const previewEvent = previewId
    ? allEvents.find((event) => event.id === previewId) ?? null
    : null;

  return (
    <>
      {view === "calendar" ? (
        <div className="overflow-hidden rounded-[20px] border border-[rgba(12,17,21,0.08)]">
          <div className="grid grid-cols-7 border-b border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.04)]">
            {labels.map((label) => (
              <div
                key={label}
                className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="min-h-40 border-r border-b border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)]"
                  />
                );
              }

              const events = eventsByDay[day] || [];
              const isToday = day === todayKey;
              const showAll = Boolean(expandedDays[day]);
              const visibleEvents = events.slice(0, 3);
              const hiddenEvents = events.slice(3);

              return (
                <div
                  key={day}
                  className="min-h-40 border-r border-b border-[rgba(12,17,21,0.08)] bg-white/82 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                        isToday ? "bg-[var(--accent-warm)] text-[var(--ink)]" : "text-[var(--ink)]"
                      }`}
                    >
                      {Number.parseInt(day.slice(-2), 10)}
                    </span>
                    {events.length > 0 ? (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {events.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    {visibleEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        expanded={Boolean(expandedRows[event.id])}
                        onToggleExpand={() =>
                          setExpandedRows((current) => ({
                            ...current,
                            [event.id]: !current[event.id],
                          }))
                        }
                        onOpenPreview={() => setPreviewId(event.id)}
                      />
                    ))}

                    {hiddenEvents.length > 0 ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDays((current) => ({
                              ...current,
                              [day]: !current[day],
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]"
                        >
                          {showAll ? "Show less" : `Show ${hiddenEvents.length} more`}
                          <ChevronRight className={`h-3 w-3 transition ${showAll ? "rotate-90" : ""}`} />
                        </button>

                        {showAll ? (
                          <div className="mt-1.5 space-y-1.5">
                            {hiddenEvents.map((event) => (
                              <EventRow
                                key={`${event.id}-extra`}
                                event={event}
                                expanded={Boolean(expandedRows[event.id])}
                                onToggleExpand={() =>
                                  setExpandedRows((current) => ({
                                    ...current,
                                    [event.id]: !current[event.id],
                                  }))
                                }
                                onOpenPreview={() => setPreviewId(event.id)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : groupedDayKeys.length === 0 ? (
        <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-4 py-8 text-sm text-[var(--muted)]">
          No items match the current filters.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedDayKeys.map((groupDay) => (
            <div key={groupDay} className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-[rgba(12,17,21,0.08)] pb-2">
                <p className="font-serif text-[1.3rem] leading-none text-[var(--ink)]">
                  {formatDayLabel(groupDay)}
                </p>
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {(eventsByDay[groupDay] || []).length} posts
                </span>
              </div>
              <div className="space-y-3">
                {(eventsByDay[groupDay] || []).map((event) => (
                  <EventDetailRow
                    key={`${groupDay}-${event.id}`}
                    event={event}
                    onOpenPreview={() => setPreviewId(event.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setPreviewId(null)}
            className="absolute inset-0 bg-[rgba(12,17,21,0.46)]"
            aria-label="Close preview"
          />
          <div className={`relative z-10 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border bg-white p-5 text-[var(--ink)] shadow-[0_24px_70px_rgba(12,17,21,0.22)] ${previewShellClass(previewEvent)}`}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={toneBadge(previewEvent.tone)}>
                    {eventStatusLabel(previewEvent.tone)}
                  </StatusBadge>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
                    {eventKindLabel(previewEvent.kind)}
                  </span>
                  <span className="text-xs opacity-70">{formatTimeInZone(previewEvent.at)}</span>
                </div>
                <h2 className="mt-3 font-serif text-[2rem] leading-none">
                  {previewEvent.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-current/15 bg-white/80"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
              {previewEvent.platforms.map((platform) => (
                  <PlatformIconMarker
                    key={`${previewEvent.id}-${platform.id}-preview`}
                    type={platform.type}
                    badgeLabel={platformBadgeCode(previewEvent, platform)}
                    label={platform.label}
                  />
                ))}
                {previewEvent.media.map((media) => (
                  <span
                    key={`${previewEvent.id}-${media.code}-preview`}
                    className="rounded-full border border-current/15 bg-white/80 px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {media.label}
                  </span>
                ))}
              </div>

              {previewEvent.mediaUrl ? (
                <div className="overflow-hidden rounded-[18px] border border-current/10 bg-white/70">
                  {previewEvent.media.some((media) => media.code === "V") ? (
                    <video
                      src={previewEvent.mediaUrl}
                      controls
                      className="max-h-[420px] w-full bg-black object-contain"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewEvent.mediaUrl}
                      alt={previewEvent.label}
                      className="max-h-[420px] w-full object-contain"
                    />
                  )}
                </div>
              ) : null}

              {previewEvent.content ? (
                <p className="whitespace-pre-wrap text-sm leading-6 opacity-90">
                  {previewEvent.content}
                </p>
              ) : previewEvent.preview ? (
                <p className="text-sm leading-6 opacity-90">{previewEvent.preview}</p>
              ) : null}

              {previewEvent.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {previewEvent.tags.map((tag) => (
                    <span
                      key={`${previewEvent.id}-${tag}-preview`}
                      className="rounded-full border border-current/15 px-2.5 py-1 text-xs font-semibold opacity-80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {previewEvent.href ? (
                <div className="pt-2">
                  <Link
                    href={previewEvent.href}
                    className="inline-flex rounded-[12px] border border-current/15 bg-white/80 px-4 py-2 text-sm font-semibold"
                  >
                    Open source
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
