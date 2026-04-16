"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Compass,
  MonitorPlay,
  MessageSquare,
  UserCircle,
  Rss,
  Share2,
  Activity,
  Settings,
  MessageSquareReply,
  Tags,
  UsersRound,
  PenSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  channelShellNav,
  footerShellNav,
  utilityShellNav,
  workspaceShellNav,
  type ShellNavItem,
} from "@/lib/dashboard-shell";
import { LogoutButton } from "@/components/logout-button";

const iconMap = {
  publish: CalendarDays,
  create: PenSquare,
  inbox: MessageSquare,
  replies: MessageSquareReply,
  notifications: Bell,
  schedules: MonitorPlay,
  categories: Tags,
  rss: Rss,
  accounts: Share2,
  profiles: UserCircle,
  overview: Compass,
  pipeline: Activity,
  team: UsersRound,
  settings: Settings,
} satisfies Record<ShellNavItem["icon"], ComponentType<{ className?: string }>>;

function NavList({
  items,
  pathname,
  compact = false,
}: {
  items: ShellNavItem[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-1.5"}>
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-start justify-between gap-3 rounded-[18px] transition",
              compact
                ? "border border-[rgba(12,17,21,0.08)] bg-[rgba(255,255,255,0.46)] px-3 py-3"
                : "px-3 py-3",
              active
                ? "bg-[rgba(15,126,169,0.10)] text-[var(--accent-tech)]"
                : "text-[var(--muted)] hover:bg-[rgba(12,17,21,0.05)] hover:text-[var(--ink)]"
            )}
          >
            <span className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border",
                  active
                    ? "border-[rgba(15,126,169,0.2)] bg-[rgba(15,126,169,0.12)]"
                    : "border-[rgba(12,17,21,0.08)] bg-white/60"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                  {item.blurb}
                </span>
              </span>
            </span>
            <ArrowUpRight
              className={cn(
                "mt-1 h-3.5 w-3.5 shrink-0 transition",
                active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            />
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[276px] lg:flex-col lg:px-4 lg:py-4">
      <div className="flex h-full flex-col rounded-[28px] border border-[rgba(12,17,21,0.08)] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_20px_60px_rgba(12,17,21,0.10)] backdrop-blur-[10px]">
        <div className="rounded-[22px] bg-[linear-gradient(145deg,#0e1520_0%,#121d2e_58%,#152438_100%)] p-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-[var(--accent-tech)]" />
              <span className="section-eyebrow text-[var(--accent-tech)]">Workspace Shell</span>
            </div>
            <span className="rounded-full border border-[rgba(108,231,255,0.16)] bg-[rgba(108,231,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-tech)]">
              Live
            </span>
          </div>
          <p className="mt-4 font-serif text-[1.7rem] leading-none tracking-[0.02em] text-[#e2e8f0]">
            BrightBean Shell
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--dark-zone-muted)]">
            Publish first. compose fast. keep the machine visible.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-3">
            <Share2 className="h-5 w-5 text-[var(--accent-tech)]" />
            <div>
              <p className="text-sm font-semibold text-[#edf6ff]">Primary Workspace</p>
              <p className="text-xs text-[var(--dark-zone-muted)]">social.maxpetrusenko.com</p>
            </div>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto">
          <div>
            <p className="section-eyebrow px-3 text-[var(--muted)]">Workspace</p>
            <div className="mt-2">
              <NavList items={workspaceShellNav} pathname={pathname} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-3">
              <p className="section-eyebrow text-[var(--muted)]">Channels</p>
              <Link
                href="/dashboard/workspace-settings/social-accounts"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-tech)]"
              >
                Add
              </Link>
            </div>
            <div className="mt-2">
              <NavList items={channelShellNav} pathname={pathname} compact />
            </div>
          </div>

          <div>
            <p className="section-eyebrow px-3 text-[var(--muted)]">Operator Tools</p>
            <div className="mt-2">
              <NavList items={utilityShellNav} pathname={pathname} />
            </div>
          </div>
        </nav>

        <div className="mt-4 space-y-3">
          <div className="dark-zone-card card-stripe-tech">
            <p className="section-eyebrow text-[var(--accent-tech)]">Live Loop</p>
            <p className="mt-2 text-sm font-semibold text-[var(--dark-zone-text)]">
              Feed → render → approve → publish → track
            </p>
          </div>

          <div className="rounded-[22px] border border-[rgba(12,17,21,0.08)] bg-[rgba(255,255,255,0.56)] p-3">
            <p className="section-eyebrow text-[var(--muted)]">Footer</p>
            <div className="mt-3 space-y-2">
              {footerShellNav.map((item) => {
                const Icon = iconMap[item.icon];
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-[14px] px-3 py-2.5 text-sm font-semibold transition",
                      active
                        ? "bg-[rgba(15,126,169,0.10)] text-[var(--accent-tech)]"
                        : "text-[var(--ink)] hover:bg-[rgba(12,17,21,0.05)]"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                );
              })}

              <LogoutButton className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(12,17,21,0.05)]" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
