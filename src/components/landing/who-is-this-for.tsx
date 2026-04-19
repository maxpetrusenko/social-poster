const PERSONAS = [
  {
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.41m5.96 5.96a14.93 14.93 0 01-5.96 2.58m0 0a14.9 14.9 0 01-8.63-2.58m8.63 2.58v4.8m0-9.38a6 6 0 015.84-7.38" />
      </svg>
    ),
    title: "Solo Founders & Indie Hackers",
    body: "You're shipping features, closing deals, and talking to customers. Posting to sixteen platforms daily is not in your job description. Let your claw handle it.",
    accent: "var(--accent-tech)",
  },
  {
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    title: "Agencies & Small Teams",
    body: "Three-person team, no social hire. ClawPoster manages multiple client brands from one dashboard with separate voices, schedules, and analytics per workspace.",
    accent: "var(--accent-spirit)",
  },
  {
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
    title: "Creators Who'd Rather Create",
    body: "You have the ideas. ClawPoster turns one idea into sixteen platform-ready posts. Spend your time on the craft, not on reformatting content for every social network.",
    accent: "var(--accent-mindfold)",
  },
];

export function WhoIsThisFor() {
  return (
    <section id="who-is-this-for" className="py-20 md:py-28 px-6">
      <div className="container">
        <p className="section-eyebrow text-[var(--accent-mindfold)] mb-3 text-center">Who It&apos;s For</p>
        <h2 className="text-3xl md:text-4xl font-bold text-center max-w-3xl mx-auto leading-tight">
          Built for people who have a business to run — not a feed to manage
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8">
          {PERSONAS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8 hover:border-[var(--accent-tech)]/30 transition-colors"
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center mb-5"
                style={{ background: `color-mix(in srgb, ${p.accent} 12%, transparent)`, color: p.accent }}
              >
                {p.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3 font-[family-name:var(--font-sans)]">{p.title}</h3>
              <p className="text-[0.95rem] leading-relaxed text-[var(--muted)]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
