"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { writePostCaption } from "@/lib/pipeline/script-writer";
import {
  CandidateRow,
  FeedDiagnosticRow,
  FeedRow,
  FeedScheduleRow,
  SettingsState,
  TabId,
  tabs,
} from "./rss-manager-shared";
import { RssOutputPanel } from "./rss-output-panel";
import { RssSelectionPanel } from "./rss-selection-panel";
import { RssSourcesPanel } from "./rss-sources-panel";

export function RssManager({
  initialSources,
  initialSettings,
  initialCandidates,
  initialDiagnostics,
  feedSchedules,
}: {
  initialSources: FeedRow[];
  initialSettings: SettingsState;
  initialCandidates: CandidateRow[];
  initialDiagnostics: FeedDiagnosticRow[];
  feedSchedules: FeedScheduleRow[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("sources");
  const [sources, setSources] = useState(initialSources);
  const [settings, setSettings] = useState({
    ...initialSettings,
    keywordBoostTermsText: initialSettings.keywordBoostTerms.join("\n"),
  });
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [newFeed, setNewFeed] = useState({
    name: "",
    url: "",
    weight: "10",
    enabled: true,
  });
  const [savingFeedId, setSavingFeedId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingFeed, setAddingFeed] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(0);
  const [selectedCandidateLink, setSelectedCandidateLink] = useState(
    initialCandidates[0]?.link ?? ""
  );

  const diagnosticsByUrl = useMemo(
    () => new Map(initialDiagnostics.map((item) => [item.sourceUrl, item])),
    [initialDiagnostics]
  );

  const rawCandidate =
    initialCandidates.find((candidate) => candidate.link === selectedCandidateLink) ??
    initialCandidates[0] ??
    null;

  // ── Enrichment: auto-fetch real summary when RSS summary is garbage ──
  const [enrichedSummaries, setEnrichedSummaries] = useState<
    Record<string, string>
  >({});
  const enrichedRef = useRef(enrichedSummaries);
  enrichedRef.current = enrichedSummaries;

  const isGarbageSummary = useCallback((summary: string) => {
    if (!summary) return true;
    const t = summary.trim().toLowerCase();
    return t.length < 15 || ["comments", "comments.", "comment", "points", "link"].includes(t);
  }, []);

  useEffect(() => {
    if (!rawCandidate) return;
    if (enrichedRef.current[rawCandidate.link]) return;
    if (!isGarbageSummary(rawCandidate.summary)) return;

    let cancelled = false;
    fetch("/api/rss-enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: rawCandidate.link,
        title: rawCandidate.title,
        summary: rawCandidate.summary,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summary?: string; keyPoints?: string[] } | null) => {
        if (cancelled || !data?.summary) return;
        setEnrichedSummaries((prev) => ({
          ...prev,
          [rawCandidate.link]: data.summary!,
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [rawCandidate, isGarbageSummary]);

  // Use enriched summary when available
  const selectedCandidate = useMemo(() => {
    if (!rawCandidate) return null;
    const enriched = enrichedSummaries[rawCandidate.link];
    if (enriched) {
      return { ...rawCandidate, summary: enriched };
    }
    return rawCandidate;
  }, [rawCandidate, enrichedSummaries]);

  const preview = useMemo(() => {
    if (!selectedCandidate) return null;

    return {
      xPost: writePostCaption(selectedCandidate, "x", {
        xTemplate: settings.xTemplate,
        linkedinTemplate: settings.linkedinTemplate,
        transformationPrompt: settings.transformationPrompt,
        seed: previewSeed,
      }),
      linkedinPost: writePostCaption(selectedCandidate, "linkedin", {
        xTemplate: settings.xTemplate,
        linkedinTemplate: settings.linkedinTemplate,
        transformationPrompt: settings.transformationPrompt,
        seed: previewSeed,
      }),
    };
  }, [
    previewSeed,
    selectedCandidate,
    settings.linkedinTemplate,
    settings.transformationPrompt,
    settings.xTemplate,
  ]);

  async function saveFeed(feed: FeedRow) {
    setSavingFeedId(feed.id);

    try {
      const response = await fetch(`/api/rss-sources/${feed.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feed),
      });
      const body = (await response.json()) as FeedRow & { error?: string };
      if (!response.ok) throw new Error(body.error || "Failed to save feed");

      setSources((current) =>
        current.map((item) => (item.id === feed.id ? body : item))
      );
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save feed");
    } finally {
      setSavingFeedId(null);
    }
  }

  async function deleteFeed(feedId: string) {
    if (!confirm("Remove this RSS feed?")) return;

    setSavingFeedId(feedId);
    try {
      const response = await fetch(`/api/rss-sources/${feedId}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Failed to delete feed");

      setSources((current) => current.filter((item) => item.id !== feedId));
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete feed");
    } finally {
      setSavingFeedId(null);
    }
  }

  async function addFeed() {
    setAddingFeed(true);
    try {
      const response = await fetch("/api/rss-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFeed.name,
          url: newFeed.url,
          weight: Number(newFeed.weight),
          enabled: newFeed.enabled,
        }),
      });
      const body = (await response.json()) as FeedRow & { error?: string };
      if (!response.ok) throw new Error(body.error || "Failed to add feed");

      setSources((current) => [...current, body]);
      setNewFeed({
        name: "",
        url: "",
        weight: "10",
        enabled: true,
      });
      setExpandedSources((current) => ({ ...current, [body.id]: true }));
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to add feed");
    } finally {
      setAddingFeed(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/rss-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateWindowHours: settings.candidateWindowHours,
          candidatePoolSize: settings.candidatePoolSize,
          minimumScore: settings.minimumScore,
          tractionWeight: settings.tractionWeight,
          keywordBoostTerms: settings.keywordBoostTermsText
            .split(/[\n,]/)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
          transformationPrompt: settings.transformationPrompt,
          xTemplate: settings.xTemplate,
          linkedinTemplate: settings.linkedinTemplate,
          imageSelectionMode: settings.imageSelectionMode,
          imageSelectionNotes: settings.imageSelectionNotes,
        }),
      });
      const body = (await response.json()) as SettingsState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Failed to save settings");

      setSettings({
        ...body,
        keywordBoostTermsText: body.keywordBoostTerms.join("\n"),
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  function pickCandidate(candidateLink: string) {
    setSelectedCandidateLink(candidateLink);
    setActiveTab("output");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[18px] border px-4 py-3 text-left transition ${
                active
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-[0_16px_36px_rgba(12,17,21,0.18)]"
                  : "border-[rgba(12,17,21,0.08)] bg-white/88 text-[var(--ink)]"
              }`}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-[var(--muted)]"}`}>
                {tab.blurb}
              </div>
            </button>
          );
        })}
      </div>

      {activeTab === "sources" ? (
        <RssSourcesPanel
          sources={sources}
          diagnosticsByUrl={diagnosticsByUrl}
          expandedSources={expandedSources}
          newFeed={newFeed}
          savingFeedId={savingFeedId}
          addingFeed={addingFeed}
          onToggleExpanded={(sourceId) =>
            setExpandedSources((current) => ({
              ...current,
              [sourceId]: !current[sourceId],
            }))
          }
          onSourcesChange={setSources}
          onSaveFeed={saveFeed}
          onDeleteFeed={deleteFeed}
          onNewFeedChange={setNewFeed}
          onAddFeed={addFeed}
        />
      ) : null}

      {activeTab === "selection" ? (
        <RssSelectionPanel
          settings={settings}
          candidates={initialCandidates}
          feedSchedules={feedSchedules}
          savingSettings={savingSettings}
          selectedCandidateLink={selectedCandidateLink}
          onSettingsChange={setSettings}
          onSaveSettings={saveSettings}
          onPickCandidate={pickCandidate}
        />
      ) : null}

      {activeTab === "output" ? (
        <RssOutputPanel
          candidates={initialCandidates}
          selectedCandidate={selectedCandidate}
          previewSeed={previewSeed}
          preview={preview}
          settings={settings}
          savingSettings={savingSettings}
          onCandidatePick={setSelectedCandidateLink}
          onRegenerate={() => setPreviewSeed((current) => current + 1)}
          onSettingsChange={setSettings}
          onSaveSettings={saveSettings}
        />
      ) : null}
    </div>
  );
}
