"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  LayoutDashboard,
  MonitorPlay,
  Share2,
  UserCircle,
  CalendarDays,
  FileText,
  Activity,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Posts", href: "/dashboard/posts", icon: FileText },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Platforms", href: "/dashboard/platforms", icon: Share2 },
  { label: "Profiles", href: "/dashboard/profiles", icon: UserCircle },
  { label: "Pipeline", href: "/dashboard/pipeline", icon: Activity },
  { label: "Schedules", href: "/dashboard/schedules", icon: MonitorPlay },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[276px] lg:flex-col lg:px-4 lg:py-4">
      <div className="flex h-full flex-col rounded-[28px] border border-[rgba(12,17,21,0.08)] bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_20px_60px_rgba(12,17,21,0.10)] backdrop-blur-[10px]">
        <div className="rounded-[22px] bg-[linear-gradient(145deg,#0e1520_0%,#121d2e_58%,#152438_100%)] p-4 text-white">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[var(--accent-tech)]" />
            <span className="section-eyebrow text-[var(--accent-tech)]">Social Ops</span>
          </div>
          <p className="mt-3 font-serif text-[1.7rem] leading-none tracking-[0.02em] text-[#e2e8f0]">
            Social Poster
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--dark-zone-muted)]">
            Live pipeline dashboard.
          </p>
        </div>

        <nav className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center justify-between rounded-[16px] px-3 py-3 text-[13px] font-semibold transition",
                  active
                    ? "bg-[rgba(15,126,169,0.10)] text-[var(--accent-tech)]"
                    : "text-[var(--muted)] hover:bg-[rgba(12,17,21,0.05)] hover:text-[var(--ink)]"
                )}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
                <ArrowUpRight
                  className={cn(
                    "h-3.5 w-3.5 transition",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="dark-zone-card card-stripe-tech mt-4">
          <p className="section-eyebrow text-[var(--accent-tech)]">Live loop</p>
          <p className="mt-2 text-sm font-semibold text-[var(--dark-zone-text)]">
            Feed → render → publish → track
          </p>
        </div>
      </div>
    </aside>
  );
}
