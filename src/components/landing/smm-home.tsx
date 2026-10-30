import Link from "next/link";
import Image from "next/image";

export function SmmAgentHome({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <main className="pt-28 pb-20 px-6">
      <div className="container">
        <section className="grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="max-w-3xl">
            <p className="section-eyebrow text-[var(--accent-mindfold)] mb-4">AI social media agent</p>
            <h1 className="text-4xl md:text-6xl font-bold leading-[1.05]">
              An operating layer for social posts, replies, approvals, and platform-specific distribution.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-[var(--muted)] leading-relaxed max-w-2xl">
              SMM Agent is the agent-focused surface for model keys, source-backed drafts, reply queues, schedules, and publishing checks designed for teams that want automation with control.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={isLoggedIn ? "/dashboard" : "/login"}
                className="h-11 inline-flex items-center rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-[var(--sand)] hover:bg-[var(--ink-soft)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-tech)] focus-visible:ring-offset-2"
              >
                {isLoggedIn ? "Open SMM Agent" : "Start using SMM Agent"}
              </Link>
              <a href="https://smmagent.app/blog" className="h-11 inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--paper)] px-5 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent-tech)]/30 transition-colors">
                Read agent articles
              </a>
            </div>
          </div>

          <figure className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--paper)] p-2 shadow-[0_28px_80px_rgba(45,35,24,0.15)]">
            <Image
              src="/demo-screens/smm-agent-calendar.png"
              alt="SMM Agent calendar showing scheduled social posts across channels"
              width={2880}
              height={1800}
              sizes="(min-width: 1024px) 54vw, 100vw"
              priority
              className="h-auto w-full rounded-[1.3rem]"
            />
            <figcaption className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Plan, review, and track every channel from one calendar.
            </figcaption>
          </figure>
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

        <section className="mt-16 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8">
          <p className="section-eyebrow text-[var(--accent-mindfold)] mb-3">Reviews</p>
          <h2 className="text-2xl md:text-3xl font-bold leading-tight">
            Proof over promises — reviews publish with receipts.
          </h2>
          <p className="mt-4 text-[0.98rem] leading-7 text-[var(--muted)] max-w-2xl">
            We do not fabricate reviews or buy ratings. Every post this agent ships is
            backed by observable output — source-backed drafts, approval receipts, and
            platform confirmation. Client reviews will be published here as they arrive,
            with consent, tied to the campaigns they came from.
          </p>
        </section>
      </div>
    </main>
  );
}
