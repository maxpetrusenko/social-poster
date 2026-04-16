"use client";

import { ArrowRight, Save, Sparkles } from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/dashboard/ui";
import {
  XPreviewCard,
  LinkedInPreviewCard,
} from "@/components/dashboard/platform-preview-cards";
import {
  CandidateRow,
  inputClass,
  SettingsFormState,
  SettingsState,
  firstSentence,
} from "./rss-manager-shared";

export function RssOutputPanel({
  candidates,
  selectedCandidate,
  previewSeed,
  preview,
  settings,
  savingSettings,
  onCandidatePick,
  onRegenerate,
  onSettingsChange,
  onSaveSettings,
}: {
  candidates: CandidateRow[];
  selectedCandidate: CandidateRow | null;
  previewSeed: number;
  preview: { xPost: string; linkedinPost: string } | null;
  settings: SettingsFormState;
  savingSettings: boolean;
  onCandidatePick: (candidateLink: string) => void;
  onRegenerate: () => void;
  onSettingsChange: (next: SettingsFormState) => void;
  onSaveSettings: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
      <div className="space-y-6">
        <SectionCard
          title="Selected Post"
          subtitle="Pick a candidate, inspect the transform step, then regenerate the final copy until it reads right."
          action={
            <button
              type="button"
              onClick={onRegenerate}
              disabled={!selectedCandidate}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              Regenerate preview
            </button>
          }
        >
          {candidates.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[rgba(12,17,21,0.12)] px-4 py-4 text-sm text-[var(--muted)]">
              No selected candidates yet.
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.slice(0, 6).map((candidate) => (
                <button
                  key={candidate.link}
                  type="button"
                  onClick={() => onCandidatePick(candidate.link)}
                  className={`block w-full rounded-[16px] border px-4 py-3 text-left transition ${
                    selectedCandidate?.link === candidate.link
                      ? "border-[var(--ink)] bg-[rgba(12,17,21,0.03)]"
                      : "border-[rgba(12,17,21,0.08)] bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{candidate.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                        {candidate.sourceLabel}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <StatusBadge tone="good">{candidate.score}</StatusBadge>
                      <StatusBadge tone="neutral">
                        traction {candidate.tractionScore.toFixed(1)}
                      </StatusBadge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Transformation Step"
          subtitle="This is the visible rewrite skill. Edit the prompt and templates, then preview the result on the right."
          action={
            <button
              type="button"
              onClick={onSaveSettings}
              disabled={savingSettings}
              className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingSettings ? "Saving…" : "Save writing logic"}
            </button>
          }
        >
          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-semibold text-[var(--ink)]">Transformation prompt</span>
              <textarea
                rows={7}
                value={settings.transformationPrompt}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    transformationPrompt: event.target.value,
                  })
                }
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <TemplateEditor
                label="X template"
                rows={5}
                value={settings.xTemplate}
                onChange={(value) =>
                  onSettingsChange({ ...settings, xTemplate: value })
                }
              />
              <TemplateEditor
                label="LinkedIn template"
                rows={5}
                value={settings.linkedinTemplate}
                onChange={(value) =>
                  onSettingsChange({ ...settings, linkedinTemplate: value })
                }
              />
            </div>
            <div className="rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-4 py-3 text-sm text-[var(--muted)]">
              <p className="font-semibold text-[var(--ink)]">Editable path</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)_36px_minmax(0,1fr)]">
                <PathNode label="selected post" />
                <ArrowNode />
                <PathNode label="transformation prompt" />
                <ArrowNode />
                <PathNode label="platform template" />
              </div>
              <p className="mt-3">
                Tokens you can use: <code>{"{{title}}"}</code>, <code>{"{{titleLower}}"}</code>,{" "}
                <code>{"{{summarySentence}}"}</code>, <code>{"{{insight}}"}</code>,{" "}
                <code>{"{{whyMatters}}"}</code>, <code>{"{{detail}}"}</code>,{" "}
                <code>{"{{builderAngle}}"}</code>, <code>{"{{reaction}}"}</code>
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Image Selection"
          subtitle="Media rule applied when the post needs an image."
        >
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            <label className="space-y-2 text-sm">
              <span className="font-semibold text-[var(--ink)]">Mode</span>
              <select
                value={settings.imageSelectionMode}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    imageSelectionMode:
                      event.target.value as SettingsState["imageSelectionMode"],
                  })
                }
                className={inputClass}
              >
                <option value="prefer_feed">Prefer feed image, fallback OG</option>
                <option value="prefer_open_graph">Prefer OG image, fallback feed</option>
                <option value="feed_only">Feed image only</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-semibold text-[var(--ink)]">Visible rule note</span>
              <textarea
                rows={4}
                value={settings.imageSelectionNotes}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    imageSelectionNotes: event.target.value,
                  })
                }
                className={inputClass}
              />
            </label>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Generated Result"
        subtitle="Selected candidate on the left. Prompt and templates in the middle. Final platform copy here."
      >
        {!selectedCandidate || !preview ? (
          <div className="rounded-[16px] border border-dashed border-[rgba(12,17,21,0.12)] px-4 py-4 text-sm text-[var(--muted)]">
            No candidate selected yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.02)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {selectedCandidate.title}
                </p>
                <StatusBadge tone="good">{selectedCandidate.score}</StatusBadge>
                <StatusBadge tone="neutral">
                  traction {selectedCandidate.tractionScore.toFixed(1)}
                </StatusBadge>
                <StatusBadge tone="neutral">{selectedCandidate.sourceLabel}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {firstSentence(selectedCandidate.summary)}
              </p>
            </div>

            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.02)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--ink)]">Preview state</p>
                <StatusBadge tone="neutral">variation {previewSeed + 1}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Regenerate changes the internal variant choice while keeping the current candidate, prompt, and templates.
              </p>
            </div>

            <div className="space-y-4">
              <XPreviewCard
                content={preview.xPost}
                mediaUrl={null}
                sourceUrl={selectedCandidate.link}
                sourceHost={null}
                handle={null}
              />
              <LinkedInPreviewCard
                content={preview.linkedinPost}
                mediaUrl={null}
                sourceUrl={selectedCandidate.link}
                sourceHost={null}
                handle={null}
              />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function TemplateEditor({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-semibold text-[var(--ink)]">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function PathNode({ label }: { label: string }) {
  return (
    <div className="rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-white px-3 py-3">
      {label}
    </div>
  );
}

function ArrowNode() {
  return (
    <div className="flex items-center justify-center">
      <ArrowRight className="h-4 w-4 text-[var(--muted)]" />
    </div>
  );
}

