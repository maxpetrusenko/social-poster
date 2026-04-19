"use client";

import { useState } from "react";

export function WaitlistForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--accent-spirit)]/10 text-[var(--accent-spirit)] font-semibold text-sm">
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7" /></svg>
        You&apos;re on the list
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 h-12 px-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-tech)]/30 text-sm"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="h-12 px-6 rounded-xl bg-[var(--ink)] text-[var(--sand)] text-sm font-semibold hover:bg-[var(--ink-soft)] transition-colors disabled:opacity-60 whitespace-nowrap"
      >
        {state === "loading" ? "..." : "Join Waitlist"}
      </button>
    </form>
  );
}
