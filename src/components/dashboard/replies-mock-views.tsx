"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Eye, GripVertical, MessageSquareText, Pencil, RefreshCw, Send, Sparkles, SplitSquareVertical, X, Zap } from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { STATUS_ACCENTS, STATUS_LABELS, type ReplyCard, type ReplyStatus } from "@/components/dashboard/replies-mock-data";

export function RepliesKanbanView({
  cards,
  counts,
  selected,
  onMove,
  onOpen,
}: {
  cards: ReplyCard[];
  counts: Record<ReplyStatus, number>;
  selected: ReplyCard;
  onMove: (id: string, status: ReplyStatus) => void;
  onOpen: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<"review" | "ready" | "posted" | null>(null);

  const columns = useMemo(
    () => [
      {
        id: "review" as const,
        label: "Review",
        count: counts.new + counts.analyzed + counts.drafted,
        accent: STATUS_ACCENTS.new,
        statuses: new Set<ReplyStatus>(["new", "analyzed", "drafted"]),
        dropStatus: "drafted" as ReplyStatus,
      },
      {
        id: "ready" as const,
        label: STATUS_LABELS.ready,
        count: counts.ready,
        accent: STATUS_ACCENTS.ready,
        statuses: new Set<ReplyStatus>(["ready"]),
        dropStatus: "ready" as ReplyStatus,
      },
      {
        id: "posted" as const,
        label: STATUS_LABELS.posted,
        count: counts.posted,
        accent: STATUS_ACCENTS.posted,
        statuses: new Set<ReplyStatus>(["posted"]),
        dropStatus: "posted" as ReplyStatus,
      },
    ],
    [counts]
  );

  return (
    <div className="space-y-6 px-1 py-2">
      <div className="mx-auto grid w-full max-w-[1720px] gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <section
            key={column.id}
            onDragOver={(event) => {
              event.preventDefault();
              if (!draggedId) return;
              setDropTarget(column.id);
            }}
            onDragLeave={() => {
              setDropTarget((current) => (current === column.id ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const cardId = event.dataTransfer.getData("text/plain") || draggedId;
              if (cardId) onMove(cardId, column.dropStatus);
              setDraggedId(null);
              setDropTarget(null);
            }}
            className={cn(
              "rounded-[24px] border bg-white/88 p-4 shadow-[0_18px_45px_rgba(12,17,21,0.08)] backdrop-blur-[6px] transition",
              dropTarget === column.id
                ? "border-[rgba(15,126,169,0.32)] bg-[rgba(15,126,169,0.06)]"
                : "border-[rgba(12,17,21,0.08)]"
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="section-eyebrow" style={{ color: column.accent }}>
                  {column.label}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {cards
                .filter((card) => column.statuses.has(card.status))
                .map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", card.id);
                      setDraggedId(card.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTarget(null);
                    }}
                    className={cn(
                      "w-full rounded-[18px] border px-4 py-4 transition",
                      selected.id === card.id
                        ? "border-[rgba(15,126,169,0.22)] bg-[rgba(15,126,169,0.08)]"
                        : "border-[rgba(12,17,21,0.08)] bg-[var(--paper)] hover:border-[rgba(12,17,21,0.16)]",
                      draggedId === card.id ? "opacity-70 ring-2 ring-[rgba(15,126,169,0.18)]" : ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => onOpen(card.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-[var(--muted)]" />
                          <p className="text-sm font-semibold text-[var(--ink)]">{card.author}</p>
                        </div>
                        {card.mediaUrl ? (
                          <div className="mt-3 overflow-hidden rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={card.mediaUrl} alt="" className="h-36 w-full object-cover" />
                          </div>
                        ) : null}
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{card.title}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <a
                          href={card.tweetUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open on X"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.16)]"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <span
                          title={card.risk === "low" ? "Low risk" : "Medium risk"}
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            card.risk === "low"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          )}
                        >
                          {card.risk === "low" ? "L" : "M"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                      <span>score {card.score}</span>
                      <span>{card.engagement.views} views</span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>

      <SectionCard
        title="Replies 1"
        subtitle="Kanban-first. Click a post to open review in a modal, then move it through review, ready, and posted."
        className="mx-auto w-full max-w-[1720px]"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]">
              <SplitSquareVertical className="h-4 w-4" />
              Hourly view
            </button>
          </div>
        }
      >
        <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-4 py-4 text-sm text-[var(--muted)]">
          Click any card in the board above to open the full review modal with original post, media, and draft actions.
        </div>
      </SectionCard>
    </div>
  );
}

export function RepliesDrawerView({
  cards,
  selected,
  editingId,
  onMove,
  onSelect,
  onEditToggle,
  onUpdateDraft,
}: {
  cards: ReplyCard[];
  selected: ReplyCard;
  editingId: string | null;
  onMove: (id: string, status: ReplyStatus) => void;
  onSelect: (id: string) => void;
  onEditToggle: (id: string | null) => void;
  onUpdateDraft: (id: string, draftIndex: number, value: string) => void;
}) {
  return (
    <div className="space-y-6 px-1 py-2">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <SectionCard
          title="Replies 2"
          subtitle="Queue plus review drawer. Approve, edit, and dispatch from one place."
          className="mx-1"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-full border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.10)] px-4 py-2 text-sm font-semibold text-[#1d4ed8]">
                <Zap className="h-4 w-4" />
                Schedule auto-pick
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {cards
              .filter((card) => card.status !== "skipped")
              .map((card) => (
                <div
                  key={card.id}
                  className={cn(
                    "w-full rounded-[20px] border px-4 py-4 transition",
                    selected.id === card.id
                      ? "border-[rgba(15,126,169,0.22)] bg-[rgba(15,126,169,0.08)]"
                      : "border-[rgba(12,17,21,0.08)] bg-[var(--paper)] hover:border-[rgba(12,17,21,0.16)]"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" onClick={() => onSelect(card.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--ink)]">{card.author}</p>
                        <StatusBadge tone={card.status === "ready" ? "good" : card.status === "posted" ? "neutral" : "warn"}>
                          {STATUS_LABELS[card.status]}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{card.title}</p>
                    </button>
                    <div className="flex items-start gap-2">
                      <a
                        href={card.tweetUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open on X"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.16)]"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <div className="text-right text-xs text-[var(--muted)]">
                        <p>score {card.score}</p>
                        <p className="mt-1">{card.updatedLabel}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    {card.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-3 py-1">
                        {tag}
                      </span>
                    ))}
                    <span>{card.engagement.likes} likes</span>
                    <span>{card.engagement.views} views</span>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>

        <ReviewDrawer
          card={selected}
          editingId={editingId}
          onMove={onMove}
          onEditToggle={onEditToggle}
          onUpdateDraft={onUpdateDraft}
        />
      </div>
    </div>
  );
}

export function ReplyReviewModal({
  card,
  onClose,
  onMove,
}: {
  card: ReplyCard;
  onClose: () => void;
  onMove: (id: string, status: ReplyStatus) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,10,13,0.58)] p-4 backdrop-blur-[4px]" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-[1480px] overflow-y-auto rounded-[30px] border border-[rgba(12,17,21,0.12)] bg-[linear-gradient(180deg,#fffdfa_0%,#f4f7fa_100%)] p-5 shadow-[0_30px_80px_rgba(7,10,13,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="section-eyebrow text-[var(--accent-tech)]">{card.author}</p>
            <h3 className="mt-2 font-serif text-[2rem] leading-none text-[var(--ink)]">Reply review</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={card.tweetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.14)]"
            >
              <ExternalLink className="h-4 w-4" />
              Open on X
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.14)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <ReplyReviewContent
          card={card}
          onMove={onMove}
        />
      </div>
    </div>
  );
}

function ReplyReviewContent({
  card,
  onMove,
}: {
  card: ReplyCard;
  onMove: (id: string, status: ReplyStatus) => void;
}) {
  return (
    <div className="grid gap-5 py-1 xl:grid-cols-[minmax(0,1.2fr)_420px]">
      <div className="space-y-4 rounded-[22px] border border-[rgba(12,17,21,0.08)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(243,247,249,0.92))] px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-eyebrow text-[var(--accent-tech)]">{card.author}</p>
            <span
              title={card.risk === "low" ? "Low risk" : "Medium risk"}
              className={cn(
                "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                card.risk === "low"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              {card.risk === "low" ? "L" : "M"}
            </span>
            <StatusBadge tone="neutral">score {card.score}</StatusBadge>
          </div>
          <div className="text-right text-xs text-[var(--muted)]">
            <p>{card.engagement.likes} likes</p>
            <p className="mt-1">updated {card.updatedLabel}</p>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#0f1419] px-5 py-5 text-[#e7edf3] shadow-[0_20px_40px_rgba(15,20,25,0.28)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#d2a35d,#0f7ea9)] text-sm font-semibold text-white">
              {card.profileName.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-semibold text-white">{card.profileName}</p>
                <p className="text-sm text-[#8b98a5]">{card.author}</p>
                <p className="text-sm text-[#8b98a5]">·</p>
                <p className="text-sm text-[#8b98a5]">{card.postedAt}</p>
              </div>
              <p className="mt-4 whitespace-pre-line text-[1.05rem] leading-8 text-[#f3f7fb]">{card.title}</p>
              {card.mediaUrl ? (
                <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.mediaUrl} alt={card.title} className="h-auto w-full object-cover" />
                </div>
              ) : null}
              <p className="mt-4 text-sm leading-7 text-[#a9b8c6]">{card.hook}</p>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-[#8b98a5]">
                <span>{card.engagement.likes} likes</span>
                <span>{card.engagement.views} views</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[rgba(12,17,21,0.08)] bg-white px-5 py-5 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow text-[var(--accent-tech)]">Draft options</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Pick one reply to approve from the right.</p>
          </div>
          <Sparkles className="h-5 w-5 text-[var(--accent-tech)]" />
        </div>

        <div className="mt-4 space-y-3">
          {card.drafts.map((draft, index) => (
            <div key={`${card.id}-kanban-draft-${index}`} className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.02)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Option {index + 1}</p>
                <StatusBadge tone={index === 0 ? "good" : "neutral"}>{index === 0 ? "Suggested" : "Alt"}</StatusBadge>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{draft}</p>
              {card.status === "posted" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge tone="neutral">Posted</StatusBadge>
                  <a
                    href={card.replyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.14)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open reply
                  </a>
                </div>
              ) : card.status === "ready" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton label="Post now" icon={Send} tone="primary" onClick={() => onMove(card.id, "posted")} />
                  <a
                    href={card.replyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.14)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <ActionButton label="Edit" icon={Pencil} onClick={() => onMove(card.id, "drafted")} />
                  <ActionButton label="Cancel" icon={Eye} onClick={() => onMove(card.id, "new")} />
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton label="Approve" icon={ArrowRight} tone="primary" onClick={() => onMove(card.id, "ready")} />
                  <ActionButton label="Edit" icon={Pencil} onClick={() => onMove(card.id, "drafted")} />
                  <ActionButton label="Skip" icon={Eye} onClick={() => onMove(card.id, "skipped")} />
                </div>
              )}
            </div>
          ))}
        </div>

        {card.status === "posted" ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[rgba(12,17,21,0.08)] pt-5">
            <a
              href={card.replyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.14)]"
            >
              <ExternalLink className="h-4 w-4" />
              Open reply
            </a>
          </div>
        ) : card.status === "ready" ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[rgba(12,17,21,0.08)] pt-5">
            <ActionButton label="Post now" icon={Send} tone="primary" onClick={() => onMove(card.id, "posted")} />
            <a
              href={card.replyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[rgba(12,17,21,0.14)]"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <ActionButton label="Edit" icon={Pencil} onClick={() => onMove(card.id, "drafted")} />
            <ActionButton label="Cancel" icon={Eye} onClick={() => onMove(card.id, "new")} />
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[rgba(12,17,21,0.08)] pt-5">
            <ActionButton label="Move to Drafted" icon={Pencil} onClick={() => onMove(card.id, "drafted")} />
            <ActionButton label="Ready to Post" icon={ArrowRight} tone="primary" onClick={() => onMove(card.id, "ready")} />
            <ActionButton label="Regenerate" icon={RefreshCw} onClick={() => onMove(card.id, "drafted")} />
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewDrawer({
  card,
  editingId,
  onMove,
  onEditToggle,
  onUpdateDraft,
}: {
  card: ReplyCard;
  editingId: string | null;
  onMove: (id: string, status: ReplyStatus) => void;
  onEditToggle: (id: string | null) => void;
  onUpdateDraft: (id: string, draftIndex: number, value: string) => void;
}) {
  return (
    <aside className="mx-1 rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] p-5 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-eyebrow text-[var(--accent-tech)]">{card.author}</p>
          <h3 className="mt-2 font-serif text-[1.85rem] leading-none text-[var(--ink)]">Review drawer</h3>
        </div>
        <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(12,17,21,0.08)] bg-white text-[var(--accent-tech)]">
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white px-4 py-4">
          <p className="section-eyebrow text-[var(--accent-spirit)]">Tweet and thread</p>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{card.title}</p>
          <div className="mt-4 space-y-3">
            {card.thread.map((line) => (
              <div key={line} className="rounded-[14px] bg-[rgba(12,17,21,0.03)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">
                {line}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="section-eyebrow text-[var(--accent-tech)]">Drafts</p>
            <MessageSquareText className="h-4 w-4 text-[var(--accent-tech)]" />
          </div>
          <div className="mt-3 space-y-3">
            {card.drafts.map((draft, index) => {
              const isEditing = editingId === `${card.id}-${index}`;

              return (
                <div key={`${card.id}-${index}`} className="rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.02)] px-3 py-3">
                  {isEditing ? (
                    <textarea
                      value={draft}
                      onChange={(event) => onUpdateDraft(card.id, index, event.target.value)}
                      className="min-h-[120px] w-full rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-white px-3 py-3 text-sm leading-6 text-[var(--ink)] outline-none"
                    />
                  ) : (
                    <p className="text-sm leading-7 text-[var(--ink)]">{draft}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton label="Approve" icon={Send} tone="primary" onClick={() => onMove(card.id, "ready")} />
                    <ActionButton
                      label={isEditing ? "Done editing" : "Edit"}
                      icon={Pencil}
                      onClick={() => onEditToggle(isEditing ? null : `${card.id}-${index}`)}
                    />
                    <ActionButton label="Reject" icon={Eye} onClick={() => onMove(card.id, "skipped")} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[18px] border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] px-4 py-4">
          <p className="section-eyebrow text-[#1d4ed8]">Status moves</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton label="Move to New" icon={RefreshCw} onClick={() => onMove(card.id, "new")} />
            <ActionButton label="Move to Drafted" icon={Sparkles} onClick={() => onMove(card.id, "drafted")} />
            <ActionButton label="Move to Ready" icon={ArrowRight} tone="primary" onClick={() => onMove(card.id, "ready")} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  tone = "neutral",
}: {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  tone?: "neutral" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition",
        tone === "primary"
          ? "bg-[var(--accent-tech)] text-white hover:opacity-90"
          : "border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)] hover:border-[rgba(12,17,21,0.14)]"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
