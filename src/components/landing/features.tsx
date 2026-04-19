"use client";

import { RevealOnScroll, StaggerChildren } from "./use-reveal";

const FEATURES = [
  { title: "AI Content Generation", desc: "Writes platform-native posts in your brand voice" },
  { title: "16 Platforms", desc: "X, LinkedIn, IG, TikTok, Threads, Bluesky, and more" },
  { title: "RSS to Social", desc: "Ingests feeds, scores articles, publishes your take" },
  { title: "Cron Schedules", desc: "Recurring content generation on autopilot" },
  { title: "Reply Engine", desc: "Discovers conversations, drafts thoughtful replies" },
  { title: "Avatar Videos", desc: "AI talking-head videos from text with your face and voice" },
  { title: "Multi-Brand", desc: "Separate workspaces, voices, and schedules per brand" },
  { title: "Deduplication", desc: "Never posts the same content twice across any platform" },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="dark-zone py-20 md:py-28 px-6 rounded-3xl mx-4 md:mx-8">
      <div className="dark-zone-inner">
        <RevealOnScroll>
          <p className="section-eyebrow text-[var(--accent-mindfold)] mb-3 text-center">What It Can Do</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center max-w-3xl mx-auto leading-tight text-white">
            Everything your social presence needs
          </h2>
        </RevealOnScroll>

        <StaggerChildren stagger={80} className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="dark-zone-card">
              <h3 className="text-base font-semibold text-white mb-2 font-[family-name:var(--font-sans)]">{f.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--dark-zone-muted)]">{f.desc}</p>
            </div>
          ))}
        </StaggerChildren>
      </div>
    </section>
  );
}
