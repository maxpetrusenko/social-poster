import { WaitlistForm } from "./waitlist-form";

const PLATFORMS = [
  "X", "LinkedIn", "Instagram", "TikTok", "Threads", "Bluesky",
  "Facebook", "YouTube", "Pinterest", "Reddit", "Mastodon",
];

export function HeroSection() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-16">
      <p className="section-eyebrow text-[var(--accent-spirit)] mb-4">AI Social Posting Agent</p>

      <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] max-w-4xl">
        Your Claw Posts<br className="hidden sm:block" /> While You Build
      </h1>

      <p className="mt-6 text-lg md:text-xl text-[var(--muted)] max-w-2xl leading-relaxed">
        Writes your posts. Adapts per platform. Publishes while you sleep.
      </p>

      <div className="mt-10 w-full max-w-md">
        <WaitlistForm source="hero" />
      </div>

      {/* Platform strip */}
      <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
        {PLATFORMS.map((p) => (
          <span key={p} className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--paper)] text-[var(--muted)] border border-[var(--line)]">
            {p}
          </span>
        ))}
      </div>
    </section>
  );
}
