"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Mail,
  PenLine,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/waitlist", label: "Waitlist", icon: ClipboardList },
  { href: "/admin/marketing", label: "Marketing", icon: Mail },
  { href: "/admin/blog", label: "Blog", icon: PenLine },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f5f0e6] text-[#171717] lg:flex">
      <aside className="sticky top-0 z-40 flex h-screen w-[260px] shrink-0 flex-col border-r border-[#dfd1bc] bg-[#fffaf2] max-lg:hidden">
        <div className="flex items-center gap-3 border-b border-[rgba(23,23,23,0.06)] px-5 py-5">
          <Image
            src="/logo-64.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl"
          />
          <div>
            <p className="font-serif text-xl leading-none tracking-[-0.03em] text-[#171717]">
              SMM Agent
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">
              Admin
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-[#f4ebdd] text-[#171717]"
                    : "text-[#5f523f] hover:bg-[#faf4ea]",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border",
                    active
                      ? "border-[#d3c2a8] bg-[#171717] text-[#f6efe3]"
                      : "border-[#dfd1bc] bg-white text-[#7f6c54]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[rgba(23,23,23,0.06)] px-3 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#5f523f] transition hover:bg-[#faf4ea]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-[rgba(23,23,23,0.08)] bg-[rgba(245,240,230,0.94)] backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="font-serif text-lg font-semibold text-[#171717]">
              Admin Panel
            </p>
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-[#5f523f] hover:underline"
            >
              Dashboard
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
            {navItems.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                    active
                      ? "bg-[#171717] text-white"
                      : "text-[#5f523f] hover:bg-[#faf4ea]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-[1200px] px-5 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
