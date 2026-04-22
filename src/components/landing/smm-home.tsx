const AUDIENCE = [
  {
    title: "Agencies",
    body: "Run multiple client brands from one place, keep each voice separated, and ship more content without turning every brief into a manual production queue.",
  },
  {
    title: "Lean teams",
    body: "Small marketing teams get a real system for drafts, approvals, and publishing instead of a stack of tabs, reminders, and late-night formatting work.",
  },
  {
    title: "Operators",
    body: "Turn repeatable social work into a workflow that stays active when the calendar gets busy and nobody has time to babysit every post.",
  },
];

const BENEFITS = [
  "Separate voices and schedules per client or brand",
  "Drafts that read like a working teammate wrote them",
  "Built for approval-driven workflows and faster handoff",
  "Less copy-paste, more actual campaign time",
];

export function SmmHome() {
  return (
    <main className="pt-28 pb-20 px-6">
      <div className="container">
        <section className="max-w-4xl">
          <p className="section-eyebrow text-[var(--accent-tech)] mb-4">Social media management</p>
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
            Social content for agencies and lean teams that need volume without the headcount.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[var(--muted)] leading-relaxed max-w-2xl">
            Powered by{" "}
            <a
              href="https://clawposter.app"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--ink)] underline decoration-[var(--accent-tech)]/40 underline-offset-4 hover:text-[var(--accent-tech)]"
            >
              ClawPoster
            </a>
            , this surface is tuned for teams that manage more than one brand, need repeatable output, and do not want every post to pass through a human bottleneck.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="https://clawposter.app/blog"
              target="_blank"
              rel="noreferrer"
              className="h-11 inline-flex items-center rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-[var(--sand)] hover:bg-[var(--ink-soft)] transition-colors"
            >
              Read the playbook
            </a>
            <a
              href="https://clawposter.app"
              target="_blank"
              rel="noreferrer"
              className="h-11 inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--paper)] px-5 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent-tech)]/30 transition-colors"
            >
              Visit ClawPoster
            </a>
          </div>
        </section>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {AUDIENCE.map((item) => (
            <article key={item.title} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
              <h2 className="text-xl font-semibold mb-3 font-[family-name:var(--font-sans)]">{item.title}</h2>
              <p className="text-sm leading-relaxed text-[var(--muted)]">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8">
            <p className="section-eyebrow text-[var(--accent-spirit)] mb-3">Why it works</p>
            <h2 className="text-2xl md:text-3xl font-bold leading-tight">
              Less prompt juggling, more client-ready output.
            </h2>
            <p className="mt-4 text-[0.98rem] leading-7 text-[var(--muted)] max-w-2xl">
              SMMClaw gives you the social layer a small team actually needs: structured brand voice, per-workspace control, and content generation that keeps moving when the team is busy with real client work. It is built to support agencies, consultants, and internal teams that want a dependable system instead of a one-off generator.
            </p>
          </article>

          <aside className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8">
            <p className="section-eyebrow text-[var(--accent-tech)] mb-3">Included</p>
            <ul className="space-y-4 text-sm leading-6 text-[var(--muted)]">
              {BENEFITS.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--accent-tech)] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}

export function SmmAgentHome() {
  return (
    <main className="pt-28 pb-20 px-6">
      <div className="container">
        <section className="max-w-4xl">
          <p className="section-eyebrow text-[var(--accent-mindfold)] mb-4">AI social media agent</p>
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] max-w-3xl">
            An operating layer for social posts, replies, approvals, and platform-specific distribution.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[var(--muted)] leading-relaxed max-w-2xl">
            SMM Agent is the agent-focused surface for model keys, source-backed drafts, reply queues, schedules, and publishing checks designed for teams that want automation with control.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a href="https://smmagent.app/blog" className="h-11 inline-flex items-center rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-[var(--sand)] hover:bg-[var(--ink-soft)] transition-colors">
              Read agent articles
            </a>
            <a href="https://clawposter.app" className="h-11 inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--paper)] px-5 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent-tech)]/30 transition-colors">
              Product home
            </a>
          </div>
        </section>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            ["Source-backed drafts", "RSS, URL, and manual evidence flows keep drafts tied to something real."],
            ["Reply operations", "Find conversations, draft responses, score risk, and keep the human approval step visible."],
            ["Bring-your-own models", "Store tested model keys per workspace and select only models unlocked by active keys."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
              <h2 className="text-xl font-semibold mb-3 font-[family-name:var(--font-sans)]">{title}</h2>
              <p className="text-sm leading-relaxed text-[var(--muted)]">{body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
