"use client";

import { useState } from "react";

export default function AnnouncementForm() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "active_7d">("all");
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/marketing/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, audience }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Send Announcement</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full rounded-lg border border-[#e5d9c8] bg-[#faf4ea] px-3 py-2 text-sm text-[#171717] placeholder:text-[#b5a68e] focus:outline-none focus:ring-1 focus:ring-[#8d7c64]"
        />
        <textarea
          placeholder="HTML body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          className="w-full rounded-lg border border-[#e5d9c8] bg-[#faf4ea] px-3 py-2 text-sm text-[#171717] placeholder:text-[#b5a68e] focus:outline-none focus:ring-1 focus:ring-[#8d7c64]"
        />
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as "all" | "active_7d")}
          className="w-full rounded-lg border border-[#e5d9c8] bg-[#faf4ea] px-3 py-2 text-sm text-[#171717] focus:outline-none focus:ring-1 focus:ring-[#8d7c64]"
        >
          <option value="all">All Users</option>
          <option value="active_7d">Active 7d</option>
        </select>
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-[#171717] px-4 py-2 text-sm font-semibold text-[#fffaf2] disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Announcement"}
        </button>
        {result && (
          <p className="text-sm text-[#5f523f]">
            Sent: {result.sent} | Failed: {result.failed}
          </p>
        )}
      </form>
    </section>
  );
}
