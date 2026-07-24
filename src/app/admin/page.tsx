import { db } from "@/db";
import {
  organizations,
  posts,
  users,
  waitlistSignups,
  workspaces,
} from "@/db/schema";
import { count, eq, gte } from "drizzle-orm";
import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  Mail,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

function KpiCard({
  label,
  value,
  sub,
  accent = "#0f7ea9",
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#e5d9c8] bg-white p-5">
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
        style={{ background: accent }}
      />
      <p className="pl-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">
        {label}
      </p>
      <p className="pl-2 pt-2 font-serif text-[2rem] leading-none text-[#171717]">
        {value.toLocaleString()}
      </p>
      {sub ? (
        <p className="pl-2 pt-2 text-sm text-[#8d7c64]">{sub}</p>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-[#e5d9c8] bg-white p-4 transition hover:border-[#d3c2a8] hover:shadow-sm"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#dfd1bc] bg-[#faf4ea] text-[#7f6c54] transition group-hover:bg-[#171717] group-hover:text-white">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-[#171717]">{label}</p>
        <p className="text-xs text-[#8d7c64]">{description}</p>
      </div>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const [
    [totalUsers],
    [activeUsers],
    [newSignups],
    [totalOrgs],
    [totalWorkspaces],
    [totalPublished],
    [waitlistCount],
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db
      .select({ count: count() })
      .from(users)
      .where(gte(users.lastSeenAt, sevenDaysAgo)),
    db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, weekStart)),
    db.select({ count: count() }).from(organizations),
    db.select({ count: count() }).from(workspaces),
    db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "published")),
    db.select({ count: count() }).from(waitlistSignups),
  ]);

  return (
    <div>
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">
          Admin
        </p>
        <h1 className="mt-1 font-serif text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-tight tracking-[-0.02em] text-[#171717]">
          Platform Overview
        </h1>
        <p className="mt-1 text-sm text-[#8d7c64]">
          Cross-organization metrics and management
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Users" value={totalUsers.count} />
        <KpiCard
          label="Active (7d)"
          value={activeUsers.count}
          accent="#22c55e"
        />
        <KpiCard
          label="New This Week"
          value={newSignups.count}
          accent="#d2a35d"
        />
        <KpiCard
          label="Signup History"
          value={waitlistCount.count}
          accent="#a855f7"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Organizations" value={totalOrgs.count} accent="#6366f1" />
        <KpiCard label="Workspaces" value={totalWorkspaces.count} accent="#06b6d4" />
        <KpiCard label="Posts Published" value={totalPublished.count} accent="#f59e0b" />
      </div>

      <h2 className="mt-10 mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">
        Quick Links
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <QuickLink
          href="/admin/users"
          label="Users"
          description="Browse all platform users"
          icon={Users}
        />
        <QuickLink
          href="/admin/waitlist"
          label="Signup History"
          description="Review legacy and active access lists"
          icon={ClipboardList}
        />
        <QuickLink
          href="/admin/marketing"
          label="Marketing"
          description="Email delivery and consent"
          icon={Mail}
        />
        <QuickLink
          href="/admin/usage"
          label="Usage"
          description="Platform-wide usage stats"
          icon={BarChart3}
        />
      </div>
    </div>
  );
}
