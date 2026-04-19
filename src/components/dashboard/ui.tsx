"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { PlatformBrandIcon } from "./platform-brand-icon";

export function DashboardHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="dark-zone overflow-hidden rounded-[28px] px-5 py-10 md:px-8 md:py-12">
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_20%_30%,rgba(15,126,169,0.14),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(210,163,93,0.10),transparent_30%),linear-gradient(145deg,#0e1520_0%,#121d2e_58%,#152438_100%)]" />
      <div className="dark-zone-inner grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
        <div>
          <p className="section-eyebrow text-[var(--accent-tech)]">{eyebrow}</p>
          <h1 className="mt-2 font-serif text-[clamp(2rem,4vw,3.15rem)] font-semibold leading-[1.02] tracking-[0.02em] text-[#e2e8f0]">
            {title}
          </h1>
          <p className="mt-3 max-w-[620px] text-[15px] leading-7 text-[var(--dark-zone-muted)] md:text-[16px]">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3 lg:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}

export function HeroButton({
  href,
  children,
  tone = "primary",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "primary" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-[10px] px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5",
        tone === "primary"
          ? "bg-[var(--paper)] text-[var(--ink)] shadow-[0_10px_24px_rgba(12,17,21,0.24)]"
          : "border border-white/10 bg-white/[0.04] text-[#d9e4ef]"
      )}
    >
      {children}
    </Link>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  accent = "var(--accent-tech)",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[rgba(12,17,21,0.08)] bg-white/88 p-5 shadow-[0_18px_45px_rgba(12,17,21,0.08)] backdrop-blur-[6px]">
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-[22px]" style={{ background: accent }} />
      <p className="pl-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="pl-2 pt-2 font-serif text-[2rem] leading-none text-[var(--ink)]">{value}</p>
      {sub ? <p className="pl-2 pt-2 text-sm text-[var(--muted)]">{sub}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white/88 p-5 shadow-[0_18px_45px_rgba(12,17,21,0.08)] backdrop-blur-[6px]", className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-serif text-[1.55rem] leading-none text-[var(--ink)]">{title}</p>
          {subtitle ? <p className="mt-2 text-sm text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PlatformChip({
  label,
  accent,
  type,
}: {
  label: string;
  accent: string;
  type: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
      style={{
        color: accent,
        borderColor: `${accent}33`,
        background: `${accent}14`,
      }}
    >
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: accent }}
      >
        <PlatformBrandIcon type={type} className="h-3 w-3" />
      </span>
      {label}
    </span>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "neutral" | "blocked";
  children: React.ReactNode;
}) {
  void tone;
  void children;

  return null;
}

export function TinyBars({
  items,
}: {
  items: Array<{ label: string; value: number; accent?: string }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="flex items-end gap-2" style={{ height: 140 }}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
          <div className="text-[11px] font-semibold text-[var(--muted)]">{item.value}</div>
          <div
            className="w-full rounded-t-[10px]"
            style={{
              height: `${Math.max((item.value / max) * 100, item.value > 0 ? 8 : 2)}%`,
              background: `linear-gradient(180deg, ${item.accent || "var(--accent-tech)"} 0%, rgba(15,126,169,0.28) 100%)`,
            }}
          />
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
