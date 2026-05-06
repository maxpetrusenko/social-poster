import {
  DashboardHero,
  DashboardPageContent,
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
    <DashboardPageContent>
      <DashboardHero
        eyebrow={eyebrow}
        title={title}
        description={description}
      />

      <SectionCard title="Planned surface" subtitle={flow}>
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

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Not enabled
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </DashboardPageContent>
  );
}
