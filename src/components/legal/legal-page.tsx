import Link from "next/link";

type LegalSection = {
  title: string;
  body: string[];
};

export function LegalPage({
  title,
  effectiveDate,
  intro,
  sections,
}: {
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[var(--sand)] px-4 py-8 text-[var(--ink)] md:py-12">
      <div className="mx-auto max-w-[980px]">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-full border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          ClawPoster
        </Link>

        <article className="mt-8 rounded-[1.5rem] border border-[var(--line)] bg-white p-6 shadow-[0_18px_50px_rgba(12,17,21,0.08)] md:p-10">
          <p className="section-eyebrow text-[var(--accent-spirit)]">
            Effective {effectiveDate}
          </p>
          <h1 className="mt-4 text-4xl leading-tight md:text-6xl">{title}</h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--muted)] md:text-lg">
            {intro}
          </p>

          <div className="mt-10 space-y-9">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-2xl leading-tight md:text-3xl">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--muted)] md:text-base">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
