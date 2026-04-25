"use client";

import { Fragment } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/dashboard/ui";
import {
  compactInputClass,
  FeedDiagnosticRow,
  FeedRow,
  firstSentence,
  iconForState,
  labelForState,
  publishedLabel,
  toneForState,
} from "./rss-manager-shared";

export function RssSourcesPanel({
  sources,
  diagnosticsByUrl,
  expandedSources,
  newFeed,
  savingFeedId,
  addingFeed,
  onToggleExpanded,
  onSourcesChange,
  onSaveFeed,
  onDeleteFeed,
  onNewFeedChange,
  onAddFeed,
}: {
  sources: FeedRow[];
  diagnosticsByUrl: Map<string, FeedDiagnosticRow>;
  expandedSources: Record<string, boolean>;
  newFeed: { name: string; url: string; weight: string; enabled: boolean };
  savingFeedId: string | null;
  addingFeed: boolean;
  onToggleExpanded: (sourceId: string) => void;
  onSourcesChange: (next: FeedRow[]) => void;
  onSaveFeed: (feed: FeedRow) => void;
  onDeleteFeed: (feedId: string) => void;
  onNewFeedChange: (next: { name: string; url: string; weight: string; enabled: boolean }) => void;
  onAddFeed: () => void;
}) {
  return (
    <SectionCard
      title="Feed Sources"
      subtitle="Compact table first. Expand a source to inspect fetched posts, traction, score breakdown, and what advanced."
    >
      <div className="overflow-hidden rounded-[20px] border border-[rgba(12,17,21,0.08)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead className="bg-[rgba(12,17,21,0.04)] text-left text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-3">Feed</th>
                <th className="px-3 py-3">URL</th>
                <th className="px-3 py-3">Weight</th>
                <th className="px-3 py-3">On</th>
                <th className="px-3 py-3">Fetched</th>
                <th className="px-3 py-3">Selected</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {sources.length === 0 ? (
                <tr className="border-t border-[rgba(12,17,21,0.08)]">
                  <td colSpan={7} className="px-3 py-6">
                    <div className="rounded-[16px] border border-dashed border-[rgba(12,17,21,0.12)] bg-white px-4 py-4 text-sm text-[var(--muted)]">
                      No RSS feeds added yet.
                    </div>
                  </td>
                </tr>
              ) : null}

              {sources.map((feed) => {
                const expanded = Boolean(expandedSources[feed.id]);
                const diagnostic = diagnosticsByUrl.get(feed.url);

                return (
                  <Fragment key={feed.id}>
                    <tr className="border-t border-[rgba(12,17,21,0.08)] align-top">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleExpanded(feed.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(12,17,21,0.1)]"
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <input
                            value={feed.name}
                            onChange={(event) =>
                              onSourcesChange(
                                sources.map((item) =>
                                  item.id === feed.id
                                    ? { ...item, name: event.target.value }
                                    : item
                                )
                              )
                            }
                            className={compactInputClass}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={feed.url}
                          onChange={(event) =>
                            onSourcesChange(
                              sources.map((item) =>
                                item.id === feed.id
                                  ? { ...item, url: event.target.value }
                                  : item
                              )
                            )
                          }
                          className={compactInputClass}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={String(feed.weight)}
                          onChange={(event) =>
                            onSourcesChange(
                              sources.map((item) =>
                                item.id === feed.id
                                  ? { ...item, weight: Number(event.target.value) || 0 }
                                  : item
                              )
                            )
                          }
                          className={compactInputClass}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={feed.enabled}
                            onChange={(event) =>
                              onSourcesChange(
                                sources.map((item) =>
                                  item.id === feed.id
                                    ? { ...item, enabled: event.target.checked }
                                    : item
                                )
                              )
                            }
                          />
                          {feed.enabled ? "Enabled" : "Paused"}
                        </label>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone="neutral">{diagnostic?.fetchedCount ?? 0}</StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={diagnostic?.selectedCount ? "good" : "neutral"}>
                          {diagnostic?.selectedCount ?? 0}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onSaveFeed(feed)}
                            disabled={savingFeedId === feed.id}
                            className="inline-flex items-center gap-2 rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold"
                          >
                            <Save className="h-4 w-4" />
                            {savingFeedId === feed.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteFeed(feed.id)}
                            disabled={savingFeedId === feed.id}
                            className="inline-flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expanded ? (
                      <tr className="border-t border-[rgba(12,17,21,0.06)] bg-[rgba(12,17,21,0.02)]">
                        <td colSpan={7} className="px-3 py-3">
                          {!diagnostic ? (
                            <div className="rounded-[16px] border border-dashed border-[rgba(12,17,21,0.12)] bg-white px-4 py-4 text-sm text-[var(--muted)]">
                              {feed.enabled
                                ? "No diagnostics yet. Feeds are fetched live during candidate analysis, not once per day. Save, then refresh."
                                : "Feed is paused. Enable it, save, then refresh to inspect fetched posts."}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                                <StatusBadge tone="good">{diagnostic.selectedCount} advanced</StatusBadge>
                                <StatusBadge tone="neutral">{diagnostic.fetchedCount} fetched live</StatusBadge>
                                <span>green advanced</span>
                                <span>amber held</span>
                                <span>gray or red filtered</span>
                              </div>
                              <div className="space-y-2">
                                {diagnostic.stories.map((story) => (
                                  <a
                                    key={`${feed.id}-${story.link}-${story.title}`}
                                    href={story.link || undefined}
                                    target={story.link ? "_blank" : undefined}
                                    rel="noreferrer"
                                    className="grid gap-3 rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-white px-4 py-3 lg:grid-cols-[minmax(0,1fr)_280px]"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="mt-0.5">{iconForState(story.state)}</span>
                                        <p className="text-sm font-semibold text-[var(--ink)]">
                                          {story.title}
                                        </p>
                                        <StatusBadge tone={toneForState(story.state)}>
                                          {labelForState(story.state)}
                                        </StatusBadge>
                                        <StatusBadge tone="neutral">score {story.score}</StatusBadge>
                                        <StatusBadge tone="neutral">
                                          traction {story.tractionScore.toFixed(1)}
                                        </StatusBadge>
                                        {story.imageUrl ? (
                                          <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                                            <ImageIcon className="h-3.5 w-3.5" />
                                            image
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-1 text-sm text-[var(--muted)]">
                                        {firstSentence(story.summary)}
                                      </p>
                                    </div>
                                    <div className="space-y-2 text-sm text-[var(--muted)]">
                                      {publishedLabel(story.publishedAt) ? (
                                        <p>Published {publishedLabel(story.publishedAt)}</p>
                                      ) : null}
                                      <p>{story.scoreBreakdown}</p>
                                      {story.link ? (
                                        <div className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                                          Source
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </div>
                                      ) : null}
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}

              <tr className="border-t border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] align-top">
                <td className="px-3 py-3">
                  <input
                    value={newFeed.name}
                    onChange={(event) =>
                      onNewFeedChange({ ...newFeed, name: event.target.value })
                    }
                    placeholder="New feed"
                    className={compactInputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    value={newFeed.url}
                    onChange={(event) =>
                      onNewFeedChange({ ...newFeed, url: event.target.value })
                    }
                    placeholder="https://example.com/feed.xml"
                    className={compactInputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    value={newFeed.weight}
                    onChange={(event) =>
                      onNewFeedChange({ ...newFeed, weight: event.target.value })
                    }
                    placeholder="10"
                    className={compactInputClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={newFeed.enabled}
                      onChange={(event) =>
                        onNewFeedChange({ ...newFeed, enabled: event.target.checked })
                      }
                    />
                    On
                  </label>
                </td>
                <td colSpan={3} className="px-3 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onAddFeed}
                      disabled={addingFeed}
                      className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      {addingFeed ? "Adding…" : "Add feed"}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
