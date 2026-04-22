"use client";

import { useEffect, useState } from "react";
import { WaitlistForm } from "./waitlist-form";

const PLATFORMS = [
  "X", "LinkedIn", "Instagram", "TikTok", "Threads", "Bluesky",
  "Facebook", "YouTube", "Pinterest", "Reddit", "Mastodon",
];

export function HeroSection() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-16 overflow-hidden">
      <p
        className="section-eyebrow text-[var(--accent-spirit)] mb-4 transition-all duration-700 ease-out"
        style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(16px)" }}
      >
        AI Social Posting Agent
      </p>

      <h1
        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] max-w-4xl transition-all duration-700 ease-out"
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(24px)",
          transitionDelay: "150ms",
        }}
      >
        Your AI Social Manager<br className="hidden sm:block" /> While You Build
      </h1>

      <p
        className="mt-6 text-lg md:text-xl text-[var(--muted)] max-w-2xl leading-relaxed transition-all duration-700 ease-out"
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transitionDelay: "300ms",
        }}
      >
        SMM Agent generates branded posts, adapts them for each platform, and publishes on your schedule across X, LinkedIn, Instagram, and more.
      </p>

      <div
        className="mt-10 w-full max-w-md transition-all duration-700 ease-out"
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transitionDelay: "450ms",
        }}
      >
        <WaitlistForm source="hero" />
      </div>

      {/* Platform strip — staggered */}
      <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
        {PLATFORMS.map((p, i) => (
          <span
            key={p}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--paper)] text-[var(--muted)] border border-[var(--line)] transition-all duration-500 ease-out"
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0) scale(1)" : "translateY(12px) scale(0.9)",
              transitionDelay: `${600 + i * 60}ms`,
            }}
          >
            {p}
          </span>
        ))}
      </div>
    </section>
  );
}
