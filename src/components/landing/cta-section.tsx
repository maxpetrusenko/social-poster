"use client";

import { RevealOnScroll } from "./use-reveal";
import { WaitlistForm } from "./waitlist-form";

export function CtaSection() {
  return (
    <section id="waitlist" className="py-20 md:py-28 px-6">
      <div className="container max-w-2xl text-center">
        <RevealOnScroll>
          <h2 className="text-3xl md:text-4xl font-bold leading-tight">
            Stop posting manually.<br />Let your claw handle it.
          </h2>
          <p className="mt-4 text-lg text-[var(--muted)]">
            Join the waitlist. Be first to get access when ClawPoster launches.
          </p>
          <div className="mt-8 max-w-md mx-auto">
            <WaitlistForm source="cta" />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
