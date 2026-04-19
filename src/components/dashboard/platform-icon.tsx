import { cn } from "@/lib/utils";
import type { CalendarEventTone } from "@/lib/dashboard/calendar";
import { normalizePlatformType } from "@/lib/dashboard/platforms";
import { getPlatformBrandIconType, PlatformBrandIcon } from "./platform-brand-icon";

function platformGlyph(type: string, className?: string) {
  const normalized = normalizePlatformType(type);
  const iconType = getPlatformBrandIconType(normalized);
  if (iconType) {
    return <PlatformBrandIcon type={iconType} className={className} />;
  }

  return <span className={cn("block h-2 w-2 rounded-full bg-current", className)} />;
}

function toneClasses(tone: CalendarEventTone) {
  if (tone === "completed") {
    return {
      shell: "border-emerald-200 bg-emerald-50",
      bubble: "bg-emerald-600 text-white",
    };
  }

  if (tone === "failed") {
    return {
      shell: "border-red-200 bg-red-50",
      bubble: "bg-red-600 text-white",
    };
  }

  if (tone === "running") {
    return {
      shell: "border-amber-200 bg-amber-50",
      bubble: "bg-amber-500 text-white",
    };
  }

  return {
    shell: "border-slate-200 bg-slate-50",
    bubble: "bg-slate-500 text-white",
  };
}

function markerStatusClasses(
  status: "planned" | "success" | "failed" | "skipped" | "running"
) {
  if (status === "success") {
    return {
      shell: "border-emerald-200 bg-emerald-50",
      dot: "bg-emerald-600",
    };
  }

  if (status === "failed") {
    return {
      shell: "border-red-200 bg-red-50",
      dot: "bg-red-600",
    };
  }

  if (status === "running") {
    return {
      shell: "border-amber-200 bg-amber-50",
      dot: "bg-amber-500",
    };
  }

  if (status === "skipped") {
    return {
      shell: "border-stone-200 bg-stone-50 text-stone-500",
      dot: "bg-stone-400",
    };
  }

  return {
    shell: "border-[rgba(12,17,21,0.10)] bg-white",
    dot: "bg-slate-400",
  };
}

export function PlatformIconCircle({
  type,
  tone,
  formatCode,
  label,
  className,
}: {
  type: string;
  tone: CalendarEventTone;
  formatCode?: string | null;
  label: string;
  className?: string;
}) {
  const toneStyle = toneClasses(tone);

  return (
    <span
      className={cn(
        "relative inline-flex h-5 w-5 items-center justify-center rounded-full border text-[var(--ink)] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
        toneStyle.shell,
        className
      )}
      title={label}
    >
      {platformGlyph(type, "h-3 w-3")}
      {formatCode ? (
        <span
          className={cn(
            "absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-[2px] text-[8px] font-bold leading-none",
            toneStyle.bubble
          )}
        >
          {formatCode}
        </span>
      ) : null}
    </span>
  );
}

export function PlatformIconMarker({
  type,
  badgeLabel,
  label,
  status = "planned",
  className,
}: {
  type: string;
  badgeLabel?: string | null;
  label: string;
  status?: "planned" | "success" | "failed" | "skipped" | "running";
  className?: string;
}) {
  const statusStyle = markerStatusClasses(status);

  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-6 items-center justify-center rounded-full border text-[var(--ink)] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
        statusStyle.shell,
        className
      )}
      title={label}
    >
      {platformGlyph(type, "h-3.5 w-3.5")}
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white", statusStyle.dot)} />
      {badgeLabel ? (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold leading-none text-white">
          {badgeLabel}
        </span>
      ) : null}
    </span>
  );
}
