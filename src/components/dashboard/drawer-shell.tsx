"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  History,
  List,
  Menu,
  MessageSquare,
  MessageSquareReply,
  PenSquare,
  Plus,
  Search,
  Settings,
  Share2,
  UserCircle,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";
import {
  channelShellNav,
  footerShellNav,
  utilityShellNav,
  workspaceShellNav,
  type ShellNavItem,
} from "@/lib/dashboard-shell";

const iconMap = {
  publish: CalendarDays,
  create: PenSquare,
  inbox: MessageSquare,
  replies: MessageSquareReply,
  notifications: Bell,
  schedules: Workflow,
  categories: Workflow,
  accounts: Share2,
  profiles: UserCircle,
  overview: Activity,
  pipeline: Activity,
  team: UsersRound,
  settings: Settings,
} satisfies Record<ShellNavItem["icon"], React.ComponentType<{ className?: string }>>;

type HeaderConfig = {
  match: string;
  title: string;
  description: string;
  createHref?: string;
  createLabel?: string;
};

const headerCopy: HeaderConfig[] = [
  {
    match: "/dashboard/calendar",
    title: "Calendar",
    description: "See monthly cadence, live runs, and posting history.",
  },
  {
    match: "/dashboard/workspace-settings/general",
    title: "Workspace Settings",
    description: "Brand defaults, timezone, approval posture, and local rules.",
  },
  {
    match: "/dashboard/workspace-settings/approvals",
    title: "Approval Rules",
    description: "Internal review mode and client-approval posture for the current workspace.",
  },
  {
    match: "/dashboard/workspace-settings/social-accounts",
    title: "Social Accounts",
    description: "Connect, verify, and manage channel access.",
    createHref: "/dashboard/workspace-settings/social-accounts?connect=1",
    createLabel: "New connection",
  },
  { match: "/dashboard/settings/team-members", title: "Team Members", description: "Manage seats, roles, and workspace access." },
  { match: "/dashboard/settings", title: "Settings", description: "Configure workspace defaults and account preferences." },
  { match: "/dashboard/platforms", title: "Platforms", description: "Review channel setup, delivery state, and configuration." },
  { match: "/dashboard/profiles", title: "Profiles", description: "Manage voice, persona, and publishing identity presets." },
  { match: "/dashboard/publish", title: "Publish", description: "Review queue state, approvals, and publish actions." },
  { match: "/dashboard/create-idea", title: "Create Idea", description: "Start a new draft, concept, or content prompt." },
  { match: "/dashboard/inbox", title: "Inbox", description: "Track inbound conversations, comments, and assigned follow-ups." },
  { match: "/dashboard/replies", title: "Replies", description: "Monitor outgoing replies and response handling." },
  { match: "/dashboard/notifications", title: "Notifications", description: "See alerts, failures, approvals, and watch items." },
  { match: "/dashboard/schedules", title: "Schedules", description: "Control cadence, timing, and scheduled runs." },
  { match: "/dashboard/categories", title: "Recurrent Posts", description: "Review recurring slots, themes, and content buckets." },
  { match: "/dashboard/pipeline", title: "Pipeline", description: "Inspect run history, logs, and execution status." },
  { match: "/dashboard", title: "Dashboard", description: "See the main board, current metrics, and workspace status." },
];

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
  compact,
}: {
  title: string;
  items: ShellNavItem[];
  pathname: string;
  onNavigate: () => void;
  compact: boolean;
}) {
  return (
    <div>
      <p className={cn("px-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[#9f8b6e]", compact && "lg:hidden")}>
        {title}
      </p>
      <div className="mt-3 space-y-1.5">
        {items.map((item) => {
          const Icon = iconMap[item.icon];
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-start gap-3 rounded-[1.2rem] px-3 py-3 transition",
                compact && "lg:justify-center lg:px-2",
                active ? "bg-[#f4ebdd] text-[#171717]" : "text-[#5f523f] hover:bg-[#faf4ea]"
              )}
              aria-label={item.label}
              title={compact ? item.label : undefined}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border",
                  active
                    ? "border-[#d3c2a8] bg-[#171717] text-[#f6efe3]"
                    : "border-[#dfd1bc] bg-white text-[#7f6c54]"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className={cn("min-w-0", compact && "lg:hidden")}>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[#8d7c64]">{item.blurb}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardDrawerShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const dashboardItem = utilityShellNav.find((item) => item.href === "/dashboard");
  const secondaryUtilityItems = utilityShellNav.filter((item) => item.href !== "/dashboard");
  const currentHeader =
    headerCopy.find((item) => pathname === item.match || (item.match !== "/dashboard" && pathname.startsWith(item.match))) ??
    headerCopy[headerCopy.length - 1];

  return (
    <div className="min-h-screen bg-[#f5f0e6] text-[#171717] lg:flex">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[320px] max-w-[88vw] border-r border-[#dfd1bc] bg-[#fffaf2] shadow-[0_24px_50px_rgba(23,23,23,0.16)] transition-transform duration-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 lg:shadow-none",
          compact ? "lg:w-[92px]" : "lg:w-[320px]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div
            className={cn(
              "flex items-center justify-between border-b border-[rgba(23,23,23,0.06)] px-5 py-5",
              compact && "lg:justify-center lg:px-3"
            )}
          >
            <div className={cn(compact && "lg:hidden")}>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[#9f8b6e]">
                Menu
              </p>
              <p className="mt-1 font-serif text-[2rem] leading-none tracking-[-0.05em] text-[#171717]">
                Social Agent
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCompact((value) => !value);
                setOpen(false);
              }}
              className="hidden h-10 w-10 items-center justify-center rounded-full border border-[#d8cab5] bg-[#f8f1e5] text-[#171717] lg:inline-flex"
              aria-label={compact ? "Expand menu" : "Collapse menu"}
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8cab5] bg-[#f8f1e5] text-[#171717] lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
            {dashboardItem ? (
              <NavSection
                title="Dashboard"
                items={[dashboardItem]}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
                compact={compact}
              />
            ) : null}
            <NavSection
              title="Workspace"
              items={workspaceShellNav}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
              compact={compact}
            />
            <NavSection
              title="Channels"
              items={channelShellNav}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
              compact={compact}
            />
            {secondaryUtilityItems.length > 0 ? (
              <NavSection
                title="Operator"
                items={secondaryUtilityItems}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
                compact={compact}
              />
            ) : null}
          </div>

          <div className="border-t border-[rgba(23,23,23,0.06)] px-4 py-4">
            <div className="space-y-1.5">
              {footerShellNav.map((item) => {
                const Icon = iconMap[item.icon];

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex rounded-[1rem] px-3 py-3 text-sm font-semibold text-[#5f523f] transition hover:bg-[#faf4ea]",
                      compact ? "items-center justify-center" : "items-center gap-3"
                    )}
                    aria-label={item.label}
                    title={compact ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={cn(compact && "lg:hidden")}>{item.label}</span>
                  </Link>
                );
              })}

              <LogoutButton
                className={cn(
                  "flex w-full rounded-[1rem] px-3 py-3 text-left text-sm font-semibold text-[#5f523f] transition hover:bg-[#faf4ea]",
                  compact ? "items-center justify-center" : "items-center gap-3"
                )}
                hideLabel={compact}
              />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-[rgba(23,23,23,0.08)] bg-[rgba(245,240,230,0.94)] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-5 px-5 py-4 md:px-8 xl:px-10">
            <div className="min-w-0 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b] lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[1.4rem] font-semibold tracking-[-0.05em] text-[#171717] md:text-[1.7rem]">
                  {currentHeader.title}
                </p>
                <p className="truncate text-sm text-[#7f6c54]">
                  {currentHeader.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <label className="hidden min-w-[16rem] items-center gap-3 rounded-full border border-[#ded2c0] bg-[#fbf7f0] px-4 py-3 text-[#8a7861] shadow-[0_8px_20px_rgba(23,23,23,0.04)] xl:flex">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  aria-label="Search dashboard"
                  placeholder="Search…"
                  className="w-full bg-transparent text-sm text-[#171717] outline-none placeholder:text-[#9b8c78]"
                  type="search"
                />
              </label>
              {currentHeader.createHref ? (
                <Link
                  href={currentHeader.createHref}
                  aria-label={currentHeader.createLabel ?? "Create new item"}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b]"
                >
                  <Plus className="h-5 w-5" />
                </Link>
              ) : (
                <button
                  type="button"
                  aria-label="Create new item"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b]"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                aria-label="Open activity history"
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b] md:inline-flex"
              >
                <History className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Open logs"
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b] md:inline-flex"
              >
                <List className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Open notifications"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d3c4ae] bg-[#fbf7f0] text-[#171717] transition hover:border-[#af987b]"
              >
                <Bell className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Open account menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8e7556,#d19c6a)] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(142,117,86,0.25)]"
              >
                SA
              </button>
            </div>
          </div>
        </header>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/30 transition lg:hidden",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setOpen(false)}
        />

        <main>{children}</main>
      </div>
    </div>
  );
}
