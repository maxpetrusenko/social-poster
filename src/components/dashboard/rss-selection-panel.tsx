"use client";

import { RefreshCw } from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/dashboard/ui";
import {
  CandidateRow,
  FeedScheduleRow,
  inputClass,
  SettingsFormState,
} from "./rss-manager-shared";

export function RssSelectionPanel({
  settings,
  candidates,
  feedSchedules,
  savingSettings,
  selectedCandidateLink,
  onSettingsChange,
  onSaveSettings,
  onPickCandidate,
}: {
  settings: SettingsFormState;
  candidates: CandidateRow[];
  feedSchedules: FeedScheduleRow[];
  savingSettings: boolean;
  selectedCandidateLink: string;
  onSettingsChange: (next: SettingsFormState) => void;
  onSaveSettings: () => void;
  onPickCandidate: (candidateLink: string) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
      <SectionCard
        title="Selection Logic"
        subtitle="All enabled feeds are fetched live when candidate analysis runs. Not a once daily import."
        action={
          <button
            type="button"
            onClick={onSaveSettings}
            disabled={savingSettings}
            className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            {savingSettings ? "Saving…" : "Save logic"}
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[var(--ink)]">Candidate window</span>
            <input
              type="number"
              value={settings.candidateWindowHours}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  candidateWindowHours: Number(event.target.value) || 1,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[var(--ink)]">Pool size</span>
            <input
              type="number"
              value={settings.candidatePoolSize}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  candidatePoolSize: Number(event.target.value) || 1,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[var(--ink)]">Minimum score</span>
            <input
              type="number"
              value={settings.minimumScore}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  minimumScore: Number(event.target.value) || 0,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[var(--ink)]">Traction weight</span>
            <input
              type="number"
              value={settings.tractionWeight}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  tractionWeight: Number(event.target.value) || 0,
                })
              }
              className={inputClass}
            />
          </label>
        </div>

        <label className="mt-4 block space-y-2 text-sm">
          <span className="font-semibold text-[var(--ink)]">Keyword boosts</span>
          <textarea
            rows={5}
            value={settings.keywordBoostTermsText}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                keywordBoostTermsText: event.target.value,
              })
            }
            className={inputClass}
          />
        </label>

        <div className="mt-5 rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-4 py-3 text-sm text-[var(--muted)]">
          Yesterday can beat a newer weak post here. Ranking now mixes freshness, source weight, AI relevance, and external traction from HN or Reddit when available.
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <PipelineCard
            label="1. Fetch"
            title="Every enabled feed"
            copy="Live pull each time analysis runs."
          />
          <PipelineCard
            label="2. Score"
            title="Freshness + relevance + source + traction"
            copy="Traction comes from linked HN or Reddit activity when found."
          />
          <PipelineCard
            label="3. Filter"
            title="Window, score floor, dedupe"
            copy="Older items can still survive if the window allows them."
          />
          <PipelineCard
            label="4. Advance"
            title={`Top ${settings.candidatePoolSize}`}
            copy="Schedules pull from this candidate pool."
          />
        </div>
      </SectionCard>

      <div className="space-y-6">
        <SectionCard
          title="Current Candidate Pool"
          subtitle="What survived selection right now."
        >
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <button
                key={candidate.link}
                type="button"
                onClick={() => onPickCandidate(candidate.link)}
                className={`block w-full rounded-[16px] border px-4 py-3 text-left transition ${
                  selectedCandidateLink === candidate.link
                    ? "border-[var(--ink)] bg-[rgba(12,17,21,0.03)]"
                    : "border-[rgba(12,17,21,0.08)] bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {candidate.title}
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge tone="good">{candidate.score}</StatusBadge>
                    <StatusBadge tone="neutral">
                      traction {candidate.tractionScore.toFixed(1)}
                    </StatusBadge>
                  </div>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  {candidate.sourceLabel}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">{candidate.summary}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Scheduled Pull Points"
          subtitle="Schedules that consume the candidate pool."
        >
          <div className="space-y-3">
            {feedSchedules.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[rgba(12,17,21,0.12)] px-4 py-4 text-sm text-[var(--muted)]">
                No feed driven schedules yet.
              </div>
            ) : (
              feedSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">{schedule.name}</p>
                    <StatusBadge tone="neutral">
                      {schedule.jobType.replace(/_/g, " ")}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{schedule.cronLabel}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {schedule.nextRuns.map((label) => (
                      <span
                        key={`${schedule.id}-${label}`}
                        className="rounded-full border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-2.5 py-1 text-xs text-[var(--muted)]"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function PipelineCard({
  label,
  title,
  copy,
}: {
  label: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{copy}</p>
    </div>
  );
}
