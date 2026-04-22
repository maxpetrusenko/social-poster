"use client";

import { StaggerChildren, RevealOnScroll } from "./use-reveal";

const STEPS = [
  {
    step: 1,
    title: "Connect Your Accounts",
    description: "Link your social platforms via OAuth. X, LinkedIn, Instagram, TikTok, Threads, Bluesky — all sixteen. Takes under two minutes.",
  },
  {
    step: 2,
    title: "Define Your Voice",
    description: "Set your brand tone, topics, and posting cadence. Add RSS feeds for industry content. Configure schedules for recurring posts.",
  },
  {
    step: 3,
    title: "Your Claw Takes Over",
    description: "The agent writes, adapts, and publishes content across every platform on schedule. Review in SMM Agent, or let it run autonomous.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 px-6">
      <div className="container">
        <RevealOnScroll>
          <p className="section-eyebrow text-[var(--accent-tech)] mb-3 text-center">How It Works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center max-w-3xl mx-auto leading-tight">
            Three steps. No learning curve.
          </h2>
        </RevealOnScroll>

        <StaggerChildren stagger={200} className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <div key={s.step} className="relative">
              <div className="text-5xl font-bold text-[var(--line)] font-[family-name:var(--font-serif)] mb-4 transition-colors duration-500 group-hover:text-[var(--accent-tech)]">
                {s.step}
              </div>
              <h3 className="text-xl font-semibold mb-3 font-[family-name:var(--font-sans)]">{s.title}</h3>
              <p className="text-[0.95rem] leading-relaxed text-[var(--muted)]">{s.description}</p>
            </div>
          ))}
        </StaggerChildren>
      </div>
    </section>
  );
}
