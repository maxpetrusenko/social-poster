import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  DashboardHero,
  HeroButton,
  SectionCard,
  StatusBadge,
} from "@/components/dashboard/ui";

type ScaffoldSection = {
  title: string;
  description: string;
  badge?: string;
  href?: string;
  hrefLabel?: string;
};

export function ShellScaffoldPage({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  flow,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
  flow: string;
  sections: ScaffoldSection[];
}) {
  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <>
            {secondaryAction ? (
              <HeroButton href={secondaryAction.href} tone="ghost">
                {secondaryAction.label}
              </HeroButton>
            ) : null}
            {primaryAction ? (
              <HeroButton href={primaryAction.href}>{primaryAction.label}</HeroButton>
            ) : null}
          </>
        }
      />

      <SectionCard title="Flow" subtitle={flow}>
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[var(--ink)]">{section.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {section.description}
                  </p>
                </div>
                {section.badge ? <StatusBadge tone="neutral">{section.badge}</StatusBadge> : null}
              </div>

              {section.href && section.hrefLabel ? (
                <Link
                  href={section.href}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-tech)]"
                >
                  {section.hrefLabel}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
