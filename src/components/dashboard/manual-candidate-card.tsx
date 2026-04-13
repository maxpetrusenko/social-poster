import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bot, ExternalLink, Flame, Globe2, MessageCircle, Newspaper } from "lucide-react";
import type { DashboardCandidate } from "@/lib/dashboard/candidates";
import { formatDate } from "@/lib/utils";

function getSourceMeta(candidate: DashboardCandidate): {
  label: string;
  actionLabel: string;
  Icon: LucideIcon;
} {
  const source = candidate.sourceName || candidate.sourceHost;
  const lowerSource = source.toLowerCase();
  const lowerHost = candidate.sourceHost.toLowerCase();

  if (source === "HN" || lowerHost.includes("ycombinator")) {
    return { label: "HN", actionLabel: "Open HN", Icon: Flame };
  }

  if (lowerSource.startsWith("r/") || lowerHost.includes("reddit.com")) {
    return { label: source, actionLabel: "Open Reddit", Icon: MessageCircle };
  }

  if (lowerHost.includes("openai.com") || lowerSource.includes("openai")) {
    return { label: "OpenAI", actionLabel: "Open OpenAI", Icon: Bot };
  }

  if (lowerHost.includes("anthropic.com") || lowerSource.includes("anthropic")) {
    return { label: "Anthropic", actionLabel: "Open Anthropic", Icon: Bot };
  }

  if (lowerHost.includes("github.com")) {
    return { label: "GitHub", actionLabel: "Open GitHub", Icon: Newspaper };
  }

  return { label: source, actionLabel: "Open Source", Icon: Globe2 };
}

export function ManualCandidateCard({
  candidate,
  href,
  showSummary = true,
}: {
  candidate: DashboardCandidate;
  href: string;
  showSummary?: boolean;
}) {
  const sourceMeta = getSourceMeta(candidate);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white">
      <div className="relative">
        {candidate.previewImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.previewImageUrl} alt={candidate.title} className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-[rgba(12,17,21,0.05)] text-sm text-[var(--muted,#6b7280)]">
            No OG image
          </div>
        )}

        <a
          href={candidate.link}
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[rgba(12,17,21,0.82)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[rgba(12,17,21,0.92)]"
        >
          <sourceMeta.Icon className="h-3.5 w-3.5" />
          {sourceMeta.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--muted,#6b7280)]">
          <span>{sourceMeta.label}</span>
          {candidate.publishedAt ? <span>{formatDate(candidate.publishedAt)}</span> : null}
        </div>

        <p className="mt-2 text-sm font-semibold text-[var(--ink,#111827)] line-clamp-3">
          {candidate.title}
        </p>

        {showSummary && candidate.summary ? (
          <p className="mt-2 text-sm text-[var(--muted,#6b7280)] line-clamp-3">
            {candidate.summary}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <Link
            href={href}
            className="inline-flex items-center rounded-full bg-[var(--accent-tech,#2563eb)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
          >
            Use Candidate
          </Link>
          <a
            href={candidate.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(12,17,21,0.1)] px-3 py-2 text-xs font-medium text-[var(--ink,#111827)] transition hover:bg-[rgba(12,17,21,0.04)]"
          >
            <sourceMeta.Icon className="h-3.5 w-3.5" />
            {sourceMeta.actionLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
