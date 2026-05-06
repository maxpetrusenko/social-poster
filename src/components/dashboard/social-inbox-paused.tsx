import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Clock3, ShieldAlert, Sparkles } from "lucide-react";
import { DashboardPageContent } from "@/components/dashboard/ui";

type SocialInboxPausedProps = {
  title: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function SocialInboxPaused({
  title,
  label,
  description,
  icon: Icon,
}: SocialInboxPausedProps) {
  return (
    <DashboardPageContent>
      <section className="overflow-hidden rounded-[1.6rem] border border-[#dfd1bc] bg-[#fffaf2] shadow-[0_18px_45px_rgba(23,23,23,0.07)]">
        <div className="relative px-5 py-8 md:px-8 md:py-10">
          <div className="absolute right-6 top-6 hidden h-28 w-28 rounded-full border border-[#e8dccb] bg-[#f8f1e5] md:block" />
          <div className="absolute right-16 top-16 hidden h-12 w-12 rounded-full bg-[#171717] opacity-[0.04] md:block" />

          <div className="relative max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d9c9b2] bg-[#f8f1e5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a6246]">
              <ShieldAlert className="h-3.5 w-3.5" />
              Temporarily paused
            </div>

            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.1rem] border border-[#d9c9b2] bg-white text-[#171717] shadow-[0_10px_24px_rgba(23,23,23,0.06)]">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8e7556]">
                  {label}
                </p>
                <h1 className="mt-2 font-serif text-[clamp(2rem,4vw,3rem)] leading-none tracking-[-0.04em] text-[#171717]">
                  {title}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f604d] md:text-[15px]">
                  {description}
                </p>
              </div>
            </div>

            <div className="mt-7 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1rem] border border-[#e5d8c7] bg-white/75 px-4 py-4">
                <div className="flex items-center gap-2 text-[#6f604d]">
                  <Clock3 className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                    What is happening
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#5f523f]">
                  We are tightening reliability, permissions, and reply safety before this queue becomes active again.
                </p>
              </div>

              <div className="rounded-[1rem] border border-[#e5d8c7] bg-white/75 px-4 py-4">
                <div className="flex items-center gap-2 text-[#6f604d]">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                    Best path now
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#5f523f]">
                  Use X Replies for live review work. Comments and DMs will return with a cleaner, safer workflow.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/dashboard/inbox/replies"
                className="inline-flex items-center gap-2 rounded-[12px] bg-[#171717] px-4 py-3 text-sm font-semibold text-[#fffaf2]"
              >
                Go to X Replies
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard/workspace-settings/social-accounts"
                className="inline-flex items-center rounded-[12px] border border-[#d3c4ae] bg-white px-4 py-3 text-sm font-semibold text-[#171717]"
              >
                Check connections
              </Link>
            </div>
          </div>
        </div>
      </section>
    </DashboardPageContent>
  );
}
