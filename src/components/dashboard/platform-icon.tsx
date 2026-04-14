import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEventTone } from "@/lib/dashboard/calendar";
import { normalizePlatformType } from "@/lib/dashboard/platforms";

function XGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2H21.5l-7.11 8.128L22.75 22h-6.547l-5.127-6.71L5.2 22H1.94l7.606-8.69L1.5 2h6.713l4.635 6.162L18.244 2Zm-1.145 18.025h1.804L7.224 3.87H5.289l11.81 16.155Z" />
    </svg>
  );
}

function platformGlyph(type: string, className?: string) {
  const normalized = normalizePlatformType(type);

  if (normalized === "x") {
    return <XGlyph className={className} />;
  }

  if (normalized === "instagram") {
    return <Instagram className={className} strokeWidth={2} />;
  }

  if (normalized === "linkedin") {
    return <Linkedin className={className} strokeWidth={2} />;
  }

  if (normalized === "facebook") {
    return <Facebook className={className} strokeWidth={2} />;
  }

  if (normalized === "youtube") {
    return <Youtube className={className} strokeWidth={2} />;
  }

  return (
    <span className={cn("text-[9px] font-bold uppercase tracking-[-0.01em]", className)}>
      {normalized.slice(0, 2)}
    </span>
  );
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
  className,
}: {
  type: string;
  badgeLabel?: string | null;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(12,17,21,0.10)] bg-white text-[var(--ink)] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
        className
      )}
      title={label}
    >
      {platformGlyph(type, "h-3.5 w-3.5")}
      {badgeLabel ? (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold leading-none text-white">
          {badgeLabel}
        </span>
      ) : null}
    </span>
  );
}
