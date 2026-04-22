"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Who It's For", href: "#who-is-this-for" },
  { label: "Blog", href: "/blog" },
];

export function LandingNav({
  isLoggedIn,
  brandName = "ClawPoster",
}: {
  isLoggedIn: boolean;
  brandName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--sand)]/80 backdrop-blur-md border-b border-[var(--line)]">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="text-xl font-bold font-[family-name:var(--font-serif)] tracking-wide">
          {brandName}
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors">
              {l.label}
            </a>
          ))}
          <Link
            href={isLoggedIn ? "/dashboard" : "#waitlist"}
            className="h-10 px-6 inline-flex items-center rounded-xl bg-[var(--ink)] text-[var(--sand)] text-sm font-semibold hover:bg-[var(--ink-soft)] transition-colors"
          >
            {isLoggedIn ? "Dashboard" : "Join Waitlist"}
          </Link>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(!open)} className="md:hidden p-2" aria-label="Menu">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[var(--line)] bg-[var(--sand)] px-4 pb-4">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-sm font-medium text-[var(--muted)]">
              {l.label}
            </a>
          ))}
          <Link
            href={isLoggedIn ? "/dashboard" : "#waitlist"}
            onClick={() => setOpen(false)}
            className="mt-2 h-10 w-full inline-flex items-center justify-center rounded-xl bg-[var(--ink)] text-[var(--sand)] text-sm font-semibold"
          >
            {isLoggedIn ? "Dashboard" : "Join Waitlist"}
          </Link>
        </div>
      )}
    </nav>
  );
}
