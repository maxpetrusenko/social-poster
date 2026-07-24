import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldCheck, XCircle } from "lucide-react";

import {
  DashboardHero,
  DashboardPageContent,
  HeroButton,
  MetricCard,
  SectionCard,
} from "@/components/dashboard/ui";
import { getTenantContext } from "@/lib/tenancy";
import { getXLikedAutopostReviewCandidates } from "@/lib/x-liked-autopost";

export const dynamic = "force-dynamic";

function truncate(value: string, max = 900) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

export default async function LikesReviewPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const candidates = await getXLikedAutopostReviewCandidates({
    workspaceId: tenant.currentWorkspace.id,
    fetchCount: 30,
  }).catch((error) => {
    console.error("[liked-queue] failed to load candidates:", error);
    return [];
  });

  const eligible = candidates.filter((candidate) => candidate.status === "eligible");
  const blocked = candidates.filter((candidate) => candidate.status === "skipped");

  return (
    <DashboardPageContent>
      <DashboardHero
        eyebrow="Liked X queue"
        title="Liked posts are reviewed publish candidates."
        description="Recent liked X posts can autopublish after source capture, writer repair, and an independent reviewer pass. Failed drafts skip instead of falling back to weak copy."
        actions={
          <>
            <HeroButton href="/dashboard/posts" tone="ghost">
              Posts
            </HeroButton>
            <HeroButton href="/dashboard/workspace-settings/social-accounts">
              X account
            </HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Fetched likes" value={candidates.length} sub="Latest visible X likes" />
        <MetricCard label="Eligible" value={eligible.length} sub="Passes current gates" accent="#0f9f6e" />
        <MetricCard label="Blocked" value={blocked.length} sub="Skipped or deduped" accent="#d97706" />
      </div>

      <SectionCard
        title="Review candidates"
        subtitle="This page shows source candidates before the runtime reviewer loop. The original post stays as source context."
      >
        {candidates.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[rgba(12,17,21,0.16)] bg-white/70 p-8 text-sm text-[var(--muted)]">
            No liked-post candidates loaded. Check the connected X account credentials.
          </div>
        ) : (
          <div className="grid gap-4">
            {candidates.map((candidate) => (
              <article
                key={candidate.id ?? candidate.sourceUrl}
                className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--ink)]">
                        @{candidate.authorHandle.replace(/^@/, "")}
                      </span>
                      {candidate.authorName ? (
                        <span className="text-sm text-[var(--muted)]">{candidate.authorName}</span>
                      ) : null}
                    </div>
                    <Link
                      href={candidate.sourceUrl}
                      target="_blank"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-tech)]"
                    >
                      Source
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <span
                    className={
                      candidate.status === "eligible"
                        ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                        : "inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                    }
                  >
                    {candidate.status === "eligible" ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {candidate.status === "eligible" ? "Eligible" : candidate.reason}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Original
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
                      {truncate(candidate.sourceText || "No text")}
                    </p>
                  </div>
                  <div className="rounded-[14px] bg-[#f7f2e8] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Draft take
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
                      {truncate(candidate.content)}
                    </p>
                    {candidate.mediaUrl ? (
                      <p className="mt-3 text-xs text-[var(--muted)]">
                        Media: {candidate.mediaType ?? "unknown"}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </DashboardPageContent>
  );
}
