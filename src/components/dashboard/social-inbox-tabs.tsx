"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, MessageSquareReply, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/dashboard/inbox/replies",
    label: "X Replies",
    icon: MessageSquareReply,
  },
  {
    href: "/dashboard/inbox/comments",
    label: "Comments",
    icon: MessageCircle,
    paused: true,
  },
  {
    href: "/dashboard/inbox/dms",
    label: "DMs",
    icon: Send,
    paused: true,
  },
];

export function SocialInboxTabs() {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 pt-6 md:px-8 xl:px-10">
      <nav
        aria-label="Social Inbox"
        className="inline-flex flex-wrap gap-1 rounded-[1rem] border border-[#dfd1bc] bg-[#fffaf2] p-1 shadow-[0_10px_28px_rgba(23,23,23,0.06)]"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[0.75rem] px-3 text-sm font-semibold transition",
                active
                  ? "bg-[#171717] text-[#fffaf2]"
                  : "text-[#5f523f] hover:bg-[#f4ebdd] hover:text-[#171717]"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.paused ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.08em]",
                    active
                      ? "bg-[#fffaf2] text-[#171717]"
                      : "bg-[#f4ebdd] text-[#8e7556]"
                  )}
                >
                  Paused
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
