"use client";

import { useMemo, useState, useTransition } from "react";
import { RefreshCw, Send, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  InboxDisplayRow,
  InboxPlatformSummary,
} from "@/lib/inbox/data";
import type { InboxSurface } from "@/lib/inbox/platforms";

export function SocialInboxSurface({
  surface,
  platforms,
  rows,
}: {
  surface: InboxSurface;
  platforms: InboxPlatformSummary[];
  rows: InboxDisplayRow[];
}) {
  const defaultPlatform =
    platforms.find((platform) => platform.connectedCount > 0 && platform.capability === "live")?.key ??
    platforms.find((platform) => platform.capability === "live")?.key ??
    platforms[0]?.key ??
    "x";
  const [activePlatform, setActivePlatform] = useState(defaultPlatform);
  const [items, setItems] = useState(rows);
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = platforms.find((platform) => platform.key === activePlatform) ?? platforms[0];
  const visibleRows = useMemo(
    () => items.filter((item) => item.platformKey === activePlatform),
    [activePlatform, items]
  );

  function pullSurface() {
    if (!active) return;
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/inbox/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface, platformKey: active.key }),
      });
      const body = (await response.json()) as {
        pulled?: number;
        error?: string;
        platformResults?: Array<{ message: string; status: string }>;
      };
      if (!response.ok) {
        setMessage(body.error || "Pull failed.");
        return;
      }
      const summary = body.platformResults?.map((result) => result.message).join(" ");
      setMessage(summary || `Pulled ${body.pulled ?? 0} items.`);
      window.location.reload();
    });
  }

  function sendReply(row: InboxDisplayRow) {
    const text = draftById[row.id]?.trim() ?? "";
    if (!text) {
      setMessage("Write a reply first.");
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: row.conversationId,
          messageId: row.messageId,
          text,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error || "Reply failed.");
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, status: "waiting_on_them" } : item
        )
      );
      setDraftById((current) => ({ ...current, [row.id]: "" }));
      setMessage("Reply sent.");
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-5 pb-6 pt-4 md:px-8 xl:px-10">
      <div className="flex flex-wrap items-center gap-2">
        {platforms.map((platform) => (
          <button
            key={platform.key}
            type="button"
            onClick={() => setActivePlatform(platform.key)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              activePlatform === platform.key
                ? "border-[#171717] bg-[#171717] text-[#fffaf2]"
                : "border-[#dfd1bc] bg-[#fffaf2] text-[#5f523f] hover:border-[#af987b]"
            )}
          >
            {platform.label}
            {platform.connectedCount > 0 ? (
              <span className="ml-2 text-xs opacity-70">{platform.connectedCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <section className="rounded-[1.4rem] border border-[#dfd1bc] bg-[#fffaf2] p-5 shadow-[0_18px_45px_rgba(23,23,23,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#9f8b6e]">
              {active?.capability ?? "planned"}
            </p>
            <h1 className="mt-2 font-serif text-[2.4rem] leading-none tracking-[-0.05em] text-[#171717]">
              {active?.label} {surfaceLabel(surface)}
            </h1>
            <p className="mt-3 max-w-[760px] text-sm leading-6 text-[#6f604d]">
              {active?.note}
            </p>
          </div>
          <button
            type="button"
            onClick={pullSurface}
            disabled={isPending || active?.connectedCount === 0 || active?.capability === "blocked"}
            className="inline-flex items-center gap-2 rounded-full border border-[#d3c4ae] bg-[#f8f1e5] px-4 py-2.5 text-sm font-semibold text-[#171717] transition hover:border-[#af987b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            {isPending ? "Pulling" : "Pull latest"}
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded-[1rem] border border-[#dfd1bc] bg-[#f8f1e5] px-4 py-3 text-sm text-[#5f523f]">
            {message}
          </div>
        ) : null}

        {visibleRows.length === 0 ? (
          <div className="mt-6 rounded-[1.1rem] border border-[#e4d7c5] px-4 py-12 text-center text-sm leading-6 text-[#6f604d]">
            No pulled {surfaceLabel(surface)} yet for {active?.label}. Use Pull latest when the account is connected and supported.
          </div>
        ) : (
          <div className="mt-6 max-h-[calc(100vh-18rem)] overflow-y-auto rounded-[1.1rem] border border-[#e4d7c5] bg-white">
            {visibleRows.map((row) => (
              <article
                key={row.id}
                className="border-b border-[#eadfce] px-4 py-4 last:border-b-0 md:px-5"
              >
                <div className="flex gap-3">
                  <Avatar name={row.author} src={row.authorAvatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-semibold text-[#171717]">{row.author}</p>
                      <span className="text-xs text-[#9b8c78]">
                        {row.receivedAt ? new Date(row.receivedAt).toLocaleString() : "unknown time"}
                      </span>
                      {row.isUnread ? (
                        <span className="rounded-full bg-[#d93f21] px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-white">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[0.98rem] leading-7 text-[#2d251d]">
                      {row.text}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#d8cab5] bg-[#fbf7f0] px-2.5 py-1 text-xs font-semibold text-[#5f523f]">
                        {row.status}
                      </span>
                      {row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#cbe1e8] bg-[#eef8fb] px-2.5 py-1 text-xs font-semibold text-[#0f7ea9]"
                        >
                          Open source <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <textarea
                        value={draftById[row.id] ?? ""}
                        onChange={(event) =>
                          setDraftById((current) => ({
                            ...current,
                            [row.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Reply..."
                        className="w-full resize-none rounded-[0.9rem] border border-[#dfd1bc] bg-[#fffaf2] px-3 py-2 text-sm outline-none focus:border-[#af987b]"
                      />
                      <button
                        type="button"
                        onClick={() => sendReply(row)}
                        disabled={isPending || !row.canReply}
                        className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-sm font-semibold text-[#fffaf2] disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#dfd1bc] bg-[#f4ebdd] bg-cover bg-center text-sm font-bold text-[#5f523f]"
      style={src ? { backgroundImage: `url("${src.replaceAll('"', "%22")}")` } : undefined}
      aria-label={name}
    >
      {src ? null : initial}
    </div>
  );
}

function surfaceLabel(surface: InboxSurface) {
  if (surface === "dms") return "DMs";
  if (surface === "comments") return "Comments";
  return "X Replies";
}
