"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SETTINGS_NAV = [
  { href: "/dashboard/settings", label: "General", exact: true },
  { href: "/dashboard/settings/profile", label: "Account" },
  { href: "/dashboard/settings/billing", label: "Billing" },
  { href: "/dashboard/settings/usage", label: "Usage" },
  { href: "/dashboard/settings/api-keys", label: "API Keys" },
  { href: "/dashboard/settings/notifications", label: "Notifications" },
  { href: "/dashboard/settings/general", label: "Organization" },
  { href: "/dashboard/settings/team-members", label: "Team Members" },
  { href: "/dashboard/settings/danger", label: "Danger Zone", danger: true },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <h1 className="text-2xl font-bold text-[#171717] mb-8">Settings</h1>

      <div className="flex gap-10">
        {/* Left sidebar nav */}
        <nav className="w-44 shrink-0 space-y-1">
          {SETTINGS_NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[#f5f0e6] text-[#171717]"
                    : item.danger
                      ? "text-red-500 hover:bg-red-50"
                      : "text-[#8d7c64] hover:bg-[#faf4ea] hover:text-[#171717]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
