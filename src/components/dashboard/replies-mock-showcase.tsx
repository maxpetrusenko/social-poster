"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { RepliesDrawerView, RepliesKanbanView, ReplyReviewModal } from "@/components/dashboard/replies-mock-views";
import { INITIAL_CARDS, type ReplyCard, type ReplyStatus, type ViewMode } from "@/components/dashboard/replies-mock-data";
import { cn } from "@/lib/utils";
import type { ReplyConnectionOption, ReplyProfileOption } from "@/lib/dashboard/replies-data";
import { DEFAULT_REPLY_PROFILE_ID } from "@/lib/replies/profiles";
import {
  getReplyLanguageLabel,
  normalizeReplyLanguage,
  type ReplyLanguage,
} from "@/lib/replies/language";

const REPLY_LANGUAGE_STORAGE_KEY = "social-poster.replyLanguage";

function buildRepliesUrl(
  platformId: string,
  profileId: string,
  language: ReplyLanguage
) {
  const params = new URLSearchParams({
    platformId,
    profileId,
    language,
  });
  return `/api/replies?${params.toString()}`;
}

export function RepliesMockShowcase({
  connections,
  profiles,
  initialCards,
  initialLanguage,
}: {
  connections: ReplyConnectionOption[];
  profiles: ReplyProfileOption[];
  initialCards: ReplyCard[];
  initialLanguage: ReplyLanguage;
}) {
  const hasLiveConnections = connections.length > 0;
  const fallbackCards = hasLiveConnections ? initialCards : initialCards.length > 0 ? initialCards : INITIAL_CARDS;
  const autoRefillAtByKey = useRef(new Map<string, number>());
  const [view, setView] = useState<ViewMode>("replies1");
  const [cards, setCards] = useState(fallbackCards);
  const [selectedId, setSelectedId] = useState(fallbackCards[0]?.id ?? "");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(connections[0]?.id ?? "mock-x-main");
  const [selectedTransport, setSelectedTransport] = useState(
    connections[0]?.transportOptions[0]?.value ?? "bird"
  );
  const [selectedProfileId, setSelectedProfileId] = useState(
    profiles.find((profile) => profile.id === DEFAULT_REPLY_PROFILE_ID)?.id ??
      profiles[0]?.id ??
      DEFAULT_REPLY_PROFILE_ID
  );
  const [selectedLanguage, setSelectedLanguage] = useState<ReplyLanguage>(
    initialLanguage
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = cards.find((card) => card.id === selectedId) ?? cards[0] ?? null;
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const reviewCount = cards.filter(
    (card) => card.status === "new" || card.status === "analyzed" || card.status === "drafted"
  ).length;

  const counts = useMemo(() => {
    const next = {
      new: 0,
      analyzed: 0,
      drafted: 0,
      ready: 0,
      posted: 0,
      skipped: 0,
    } satisfies Record<ReplyStatus, number>;

    for (const card of cards) next[card.status] += 1;

    return next;
  }, [cards]);

  const refreshLiveReplies = useCallback((mode: "auto" | "manual" = "manual") => {
    if (!selectedConnectionId || selectedConnectionId === "mock-x-main") {
      setCards(INITIAL_CARDS);
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch("/api/replies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platformId: selectedConnectionId,
            profileId: selectedProfileId,
            mode,
            language: selectedLanguage,
          }),
        });
        const body = (await response.json()) as { cards?: ReplyCard[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Failed to refresh replies");
        setCards(body.cards ?? []);
        setSelectedId((current) => body.cards?.some((item) => item.id === current) ? current : body.cards?.[0]?.id || "");
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh replies");
      }
    });
  }, [selectedConnectionId, selectedLanguage, selectedProfileId]);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(REPLY_LANGUAGE_STORAGE_KEY);
    if (storedLanguage) {
      setSelectedLanguage(normalizeReplyLanguage(storedLanguage));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(REPLY_LANGUAGE_STORAGE_KEY, selectedLanguage);
  }, [selectedLanguage]);

  useEffect(() => {
    if (!selectedConnectionId || selectedConnectionId === "mock-x-main") return;

    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          buildRepliesUrl(selectedConnectionId, selectedProfileId, selectedLanguage)
        );
        const body = (await response.json()) as { cards?: ReplyCard[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Failed to load replies");

        let nextCards = body.cards ?? [];

        const refreshKey = `${selectedConnectionId}:${selectedProfileId}`;
        const shouldAutoRefresh =
          !nextCards.some(
            (card) => card.status === "new" || card.status === "analyzed" || card.status === "drafted"
          ) && shouldAutoRefill(refreshKey, autoRefillAtByKey.current);

        if (shouldAutoRefresh) {
          autoRefillAtByKey.current.set(refreshKey, Date.now());
          const refreshResponse = await fetch("/api/replies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platformId: selectedConnectionId,
              profileId: selectedProfileId,
              mode: "manual",
              language: selectedLanguage,
            }),
          });
          const refreshBody = (await refreshResponse.json()) as { cards?: ReplyCard[]; error?: string };
          if (!refreshResponse.ok) throw new Error(refreshBody.error || "Failed to refresh replies");
          nextCards = refreshBody.cards ?? [];
        }

        setCards(nextCards);
        setSelectedId((current) => nextCards.some((item) => item.id === current) ? current : nextCards[0]?.id || "");
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load replies");
      }
    });
  }, [selectedConnectionId, selectedLanguage, selectedProfile?.label, selectedProfileId]);

  useEffect(() => {
    if (!selectedConnectionId || selectedConnectionId === "mock-x-main") return;
    if (!cards.some((card) => card.status === "ready")) return;

    const interval = window.setInterval(() => {
      startTransition(async () => {
        try {
          const response = await fetch(
            buildRepliesUrl(selectedConnectionId, selectedProfileId, selectedLanguage)
          );
          const body = (await response.json()) as { cards?: ReplyCard[]; error?: string };
          if (!response.ok) throw new Error(body.error || "Failed to sync replies");
          const nextCards = body.cards ?? [];
          setCards(nextCards);
          setSelectedId((current) =>
            nextCards.some((item) => item.id === current) ? current : nextCards[0]?.id || ""
          );
          setError(null);
        } catch (syncError) {
          setError(syncError instanceof Error ? syncError.message : "Failed to sync replies");
        }
      });
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [cards, selectedConnectionId, selectedLanguage, selectedProfileId]);

  useEffect(() => {
    if (!selectedConnectionId || selectedConnectionId === "mock-x-main") return;
    if (reviewCount > 0 || isPending) return;

    const refreshKey = `${selectedConnectionId}:${selectedProfileId}`;
    if (!shouldAutoRefill(refreshKey, autoRefillAtByKey.current)) return;

    autoRefillAtByKey.current.set(refreshKey, Date.now());
    refreshLiveReplies("manual");
  }, [isPending, refreshLiveReplies, reviewCount, selectedConnectionId, selectedProfileId]);

  function moveCard(id: string, status: ReplyStatus, selectedDraftIndex?: number) {
    const previous = cards;
    setCards((current) => current.map((card) => (card.id === id ? { ...card, status, updatedLabel: "just now" } : card)));

    startTransition(async () => {
      try {
        setError(null);
        const endpoint = status === "posted" ? `/api/replies/${id}/post` : `/api/replies/${id}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            status === "posted"
              ? JSON.stringify({})
              : JSON.stringify({
                  status,
                  selectedDraftIndex:
                    typeof selectedDraftIndex === "number" ? selectedDraftIndex : undefined,
                }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Failed to update reply");
        if (selectedConnectionId && selectedConnectionId !== "mock-x-main") {
          const next = await fetch(
            buildRepliesUrl(selectedConnectionId, selectedProfileId, selectedLanguage)
          );
          const nextBody = (await next.json()) as { cards?: ReplyCard[]; error?: string };
          if (!next.ok) throw new Error(nextBody.error || "Failed to sync replies");
          setCards(nextBody.cards ?? []);
        }
      } catch (updateError) {
        setCards(previous);
        setError(updateError instanceof Error ? updateError.message : "Failed to update reply");
      }
    });
  }

  function updateDraft(id: string, draftIndex: number, value: string) {
    const previous = cards;
    setCards((current) =>
      current.map((card) =>
        card.id === id
          ? {
              ...card,
              drafts: card.drafts.map((draft, index) => (index === draftIndex ? value : draft)),
              updatedLabel: "edited now",
            }
          : card
      )
    );

    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(`/api/replies/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftIndex, draftText: value }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Failed to save draft");
      } catch (updateError) {
        setCards(previous);
        setError(updateError instanceof Error ? updateError.message : "Failed to save draft");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2 px-1 py-2">
        {profiles.length <= 1 ? (
          <div className="rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-left text-sm text-[var(--ink)]">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Profile
            </span>
            <span className="block truncate font-semibold text-[var(--ink)]">
              {selectedProfile?.label || "Agent Persona"}
            </span>
          </div>
        ) : (
          <details className="relative">
            <summary className="list-none cursor-pointer rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-left text-sm text-[var(--ink)]">
              <span className="flex items-center gap-3">
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Profile
                  </span>
                  <span className="block truncate font-semibold text-[var(--ink)]">
                    {selectedProfile?.label || "Agent Persona"}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
              </span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white p-2 shadow-[0_18px_45px_rgba(12,17,21,0.12)]">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={cn(
                    "flex w-full items-start justify-between rounded-[14px] px-3 py-3 text-left text-sm transition hover:bg-[rgba(12,17,21,0.03)]",
                    selectedProfileId === profile.id ? "bg-[rgba(15,126,169,0.08)]" : ""
                  )}
                >
                  <span>
                    <span className="block font-semibold text-[var(--ink)]">{profile.label}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      {profile.summary} · {profile.destination}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </details>
        )}
        <details className="relative">
          <summary className="list-none cursor-pointer rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-left text-sm text-[var(--ink)]">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Language
            </span>
            <span className="block truncate font-semibold text-[var(--ink)]">
              {getReplyLanguageLabel(selectedLanguage)}
            </span>
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-[220px] rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white p-2 shadow-[0_18px_45px_rgba(12,17,21,0.12)]">
            {(["en", "any"] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => setSelectedLanguage(language)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[14px] px-3 py-3 text-left text-sm font-semibold transition hover:bg-[rgba(12,17,21,0.03)]",
                  selectedLanguage === language
                    ? "bg-[rgba(15,126,169,0.08)] text-[var(--accent-tech)]"
                    : "text-[var(--ink)]"
                )}
              >
                {getReplyLanguageLabel(language)}
              </button>
            ))}
          </div>
        </details>
        <details className="relative">
          <summary className="list-none cursor-pointer rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]">
            {selectedConnection?.label || "Select X connection"}
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white p-2 shadow-[0_18px_45px_rgba(12,17,21,0.12)]">
            {(connections.length > 0 ? connections : [{
              id: "mock-x-main",
              label: "X Main",
              handle: "@maxpetrusenko",
              provider: "bird",
              authMethod: "bird_cli",
              transportOptions: [{ value: "bird" as const, label: "Bird" }],
            }]).map((connection) => (
              <button
                key={connection.id}
                type="button"
                onClick={() => {
                  setSelectedConnectionId(connection.id);
                  setSelectedTransport(connection.transportOptions[0]?.value ?? "bird");
                }}
                className={cn(
                  "flex w-full items-start justify-between rounded-[14px] px-3 py-3 text-left text-sm transition hover:bg-[rgba(12,17,21,0.03)]",
                  selectedConnectionId === connection.id ? "bg-[rgba(15,126,169,0.08)]" : ""
                )}
              >
                <span>
                  <span className="block font-semibold text-[var(--ink)]">{connection.label}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {connection.handle || "No handle"} · {connection.authMethod || connection.provider}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </details>
        <details className="relative">
          <summary className="list-none cursor-pointer rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]">
            {selectedTransport === "bird" ? "Bird" : "X API"}
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-[200px] rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white p-2 shadow-[0_18px_45px_rgba(12,17,21,0.12)]">
            {(selectedConnection?.transportOptions ?? [{ value: selectedTransport, label: selectedTransport === "bird" ? "Bird" : "X API" }]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedTransport(option.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[14px] px-3 py-3 text-left text-sm font-semibold transition hover:bg-[rgba(12,17,21,0.03)]",
                  selectedTransport === option.value ? "bg-[rgba(15,126,169,0.08)] text-[var(--accent-tech)]" : "text-[var(--ink)]"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </details>
        <div className="inline-flex rounded-full border border-[rgba(12,17,21,0.08)] bg-white p-1">
          <button
            type="button"
            onClick={() => setView("replies1")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              view === "replies1" ? "bg-[var(--accent-tech)] text-white" : "text-[var(--muted)]"
            )}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("replies2")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              view === "replies2" ? "bg-[var(--accent-tech)] text-white" : "text-[var(--muted)]"
            )}
          >
            List
          </button>
        </div>
        <button
          type="button"
          onClick={() => refreshLiveReplies("manual")}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full border border-[rgba(12,17,21,0.08)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          {isPending ? "Refreshing..." : "Refresh now"}
        </button>
      </div>

      {error ? (
        <div className="mx-auto w-full max-w-[1720px] rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {cards.length === 0 ? (
        <div className="mx-auto flex w-full max-w-[1720px] flex-col items-center justify-center rounded-[28px] border border-[rgba(12,17,21,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,247,249,0.94))] px-6 py-16 text-center shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
          <p className="section-eyebrow text-[var(--accent-tech)]">Live reply queue</p>
          <h2 className="mt-3 font-serif text-[2rem] leading-none text-[var(--ink)]">No active queue yet</h2>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-[var(--muted)]">
            {hasLiveConnections
              ? "Open the page to auto-backfill a small review batch, or hit Refresh now for a broader manual pull."
              : "Add an X connection first. Mock cards stay available only when no live connection exists."}
          </p>
        </div>
      ) : (
        <>
          {view === "replies1" && selected ? (
            <RepliesKanbanView
              cards={cards}
              counts={counts}
              selected={selected}
              onMove={moveCard}
              onOpen={(id) => {
                setSelectedId(id);
                setEditingId(null);
                setIsModalOpen(true);
              }}
            />
          ) : selected ? (
            <RepliesDrawerView
              cards={cards}
              selected={selected}
              editingId={editingId}
              onMove={moveCard}
              onSelect={setSelectedId}
              onEditToggle={setEditingId}
              onUpdateDraft={updateDraft}
            />
          ) : null}
        </>
      )}

      {view === "replies1" && selected && isModalOpen ? (
        <ReplyReviewModal
          card={selected}
          onClose={() => {
            setIsModalOpen(false);
            setEditingId(null);
          }}
          onMove={moveCard}
        />
      ) : null}
    </div>
  );
}

function shouldAutoRefill(key: string, state: Map<string, number>) {
  const lastTriggeredAt = state.get(key) ?? 0;
  return Date.now() - lastTriggeredAt >= 10 * 60_000;
}
