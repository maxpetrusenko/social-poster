"use client";

import type { ComponentType } from "react";
import { CalendarClock, Clapperboard, Check, Loader2, RefreshCw, Send, Save, ThumbsDown, Wand2 } from "lucide-react";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { getSpecForPlatform } from "@/lib/platform-specs";

export type CampaignData = {
  title: string;
  campaignId: string;
  status: string;
  header: string;
  description: string;
  visualPrompt: string;
  imageSeed: string;
  animation: string;
  imageUrl: string;
};

export type ConnectedPlatform = {
  id: string;
  type: string;
  name: string;
  handle: string | null;
  enabled: boolean;
};

export type RenditionChoice = {
  key: string;
  format: string;
  label: string;
  width: number;
  height: number;
  aspect: string;
};

export type PublishMode = "draft" | "schedule" | "publish";

export function CampaignDeliveryPanel({
  campaign,
  platforms,
  selectedPlatformIds,
  selectedRenditions,
  platformRenditions,
  publishMode,
  scheduledAt,
  saving,
  statusMessage,
  error,
  campaignId,
  onPublishModeChange,
  onScheduledAtChange,
  onTogglePlatform,
  onSelectRendition,
  onDeliver,
  onGenerateImage,
  onApprove,
  onDeny,
  onAnimate,
  onEditAgain,
}: {
  campaign: CampaignData;
  platforms: ConnectedPlatform[];
  campaignId: string | null;
  selectedPlatformIds: string[];
  selectedRenditions: Record<string, RenditionChoice>;
  platformRenditions: Map<string, RenditionChoice[]>;
  publishMode: PublishMode;
  scheduledAt: string;
  saving: boolean;
  statusMessage: string | null;
  error: string | null;
  onPublishModeChange: (mode: PublishMode) => void;
  onScheduledAtChange: (value: string) => void;
  onTogglePlatform: (platformId: string) => void;
  onSelectRendition: (platformId: string, choice: RenditionChoice) => void;
  onDeliver: () => void;
  onGenerateImage: () => void;
  onApprove: () => void;
  onDeny: () => void;
  onAnimate: () => void;
  onEditAgain: () => void;
}) {
  const deliveryLabel =
    publishMode === "schedule"
      ? "Apply to Calendar"
      : publishMode === "publish"
        ? "Publish Draft"
        : "Save Draft";

  return (
    <aside className="space-y-4">
      <div className="rounded-[8px] border border-[#d6d6d6] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#666]">Delivery</p>
            <h3 className="mt-1 text-sm font-semibold text-[#171717]">Targets and publish mode</h3>
          </div>
          <span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#555]">
            {selectedPlatformIds.length} selected
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-xs">
          <MetaLine label="Campaign ID" value={campaignId ?? campaign.campaignId ?? "not linked"} />
          <MetaLine label="Status" value={campaign.status} />
          {campaign.imageUrl ? <MetaLine label="Image URL" value={campaign.imageUrl} mono /> : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <ModeButton active={publishMode === "draft"} onClick={() => onPublishModeChange("draft")} label="Draft" icon={Save} />
          <ModeButton active={publishMode === "schedule"} onClick={() => onPublishModeChange("schedule")} label="Calendar" icon={CalendarClock} />
          <ModeButton active={publishMode === "publish"} onClick={() => onPublishModeChange("publish")} label="Publish" icon={Send} />
        </div>

        {publishMode === "schedule" ? (
          <label className="mt-4 block">
            <span className="text-xs font-semibold text-[#555]">Calendar time</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={defaultScheduledAt()}
              onChange={(event) => onScheduledAtChange(event.target.value)}
              className="mt-1 w-full rounded-[8px] border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]"
            />
          </label>
        ) : null}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#666]">Platforms</p>
          <div className="mt-2 space-y-2">
            {platforms.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-[#d6d6d6] bg-[#fafafa] px-3 py-4 text-sm text-[#666]">
                No connected platforms.
              </div>
            ) : (
              platforms.map((platform) => {
                const selected = selectedPlatformIds.includes(platform.id);
                const meta = getPlatformMeta(platform.type);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => onTogglePlatform(platform.id)}
                    className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-[#171717] bg-[#171717] text-white"
                        : "border-[#d8d8d8] bg-white text-[#171717] hover:bg-[#f6f6f6]"
                    } ${platform.enabled ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{platform.name}</p>
                        <p className={`truncate text-xs ${selected ? "text-white/72" : "text-[#666]"}`}>
                          {meta.label}
                          {platform.handle ? ` · ${platform.handle}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          selected ? "bg-white/12 text-white" : "bg-[#f3f3f3] text-[#555]"
                        }`}
                      >
                        {platform.enabled ? "Ready" : "Off"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {selectedPlatformIds.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#666]">Renditions</p>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                Exact platform specs
              </span>
            </div>
            <div className="space-y-3">
              {selectedPlatformIds.map((platformId) => {
                const platform = platforms.find((item) => item.id === platformId);
                const choices = platformRenditions.get(platformId) ?? [];
                if (!platform || choices.length === 0) return null;
                const activeChoice = selectedRenditions[platformId] ?? choices[0];
                return (
                  <div key={platformId} className="rounded-[8px] border border-[#e1e1e1] bg-[#fafafa] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#171717]">{platform.name}</p>
                        <p className="text-xs text-[#666]">{platform.type}</p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">
                        {activeChoice.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {choices.map((choice) => {
                        const selected = choice.key === activeChoice.key;
                        return (
                          <button
                            key={choice.key}
                            type="button"
                            onClick={() => onSelectRendition(platformId, choice)}
                            className={`rounded-[999px] border px-2.5 py-1.5 text-xs font-semibold transition ${
                              selected
                                ? "border-[#171717] bg-[#171717] text-white"
                                : "border-[#d7d7d7] bg-white text-[#333] hover:bg-[#f2f2f2]"
                            }`}
                          >
                            {choice.format} {choice.label} {choice.width}x{choice.height} {choice.aspect}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => void onDeliver()}
            disabled={saving || selectedPlatformIds.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#171717] bg-[#171717] px-3 py-3 text-sm font-semibold text-white transition hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : publishMode === "publish" ? <Send className="h-4 w-4" /> : publishMode === "schedule" ? <CalendarClock className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {deliveryLabel}
          </button>
          {error ? (
            <p className="rounded-[8px] border border-[#efb8a8] bg-[#fff0eb] px-3 py-2 text-xs font-medium text-[#9c321f]">
              {error}
            </p>
          ) : null}
          {statusMessage ? (
            <p className="rounded-[8px] border border-[#d6d6d6] bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#444]">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        <ActionButton icon={Wand2} label="Generate image" onClick={onGenerateImage} />
        <ActionButton icon={Check} label="Approve" onClick={onApprove} />
        <ActionButton icon={ThumbsDown} label="Deny" onClick={onDeny} />
        <ActionButton icon={Clapperboard} label="Animate" onClick={onAnimate} />
        <ActionButton icon={RefreshCw} label="Edit again" onClick={onEditAgain} />
        <div className="rounded-[8px] border border-[#d6d6d6] bg-[#fafafa] p-3 text-xs leading-5 text-[#555]">
          Animation: <span className="font-semibold text-[#171717]">{campaign.animation}</span>
        </div>
      </div>
    </aside>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[8px] border px-2.5 py-2 text-xs font-semibold transition ${
        active
          ? "border-[#171717] bg-[#171717] text-white"
          : "border-[#d7d7d7] bg-white text-[#171717] hover:bg-[#f3f3f3]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-[8px] border border-[#d6d6d6] bg-white px-3 py-2.5 text-sm font-semibold text-[#171717] hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MetaLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[8px] border border-[#e3e3e3] bg-[#fafafa] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#777]">{label}</p>
      <p className={`mt-1 truncate text-[11px] ${mono ? "font-mono" : "font-medium"} text-[#222]`}>{value}</p>
    </div>
  );
}

export function defaultScheduledAt() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(date);
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildPlatformRenditions(platforms: ConnectedPlatform[]) {
  const renditions = new Map<string, RenditionChoice[]>();

  for (const platform of platforms) {
    const spec = getSpecForPlatform(platform.type);
    renditions.set(platform.id, spec ? buildChoicesFromSpec(spec) : []);
  }

  return renditions;
}

function buildChoicesFromSpec(spec: NonNullable<ReturnType<typeof getSpecForPlatform>>) {
  const outputs: RenditionChoice[] = [];
  const formatNames = spec.formats.length > 0 ? spec.formats : ["default"];

  for (const format of formatNames) {
    const dimensions = spec.imageDimensions[format] ?? spec.imageDimensions.default ?? [];
    for (const dimension of dimensions) {
      outputs.push({
        key: `${format}:${dimension.label}:${dimension.width}x${dimension.height}`,
        format,
        label: dimension.label,
        width: dimension.width,
        height: dimension.height,
        aspect: dimension.aspect,
      });
    }
  }

  return outputs;
}

export function buildDefaultRenditions(platforms: ConnectedPlatform[], selectedPlatformIds: string[]) {
  const result: Record<string, RenditionChoice> = {};
  const platformMap = new Map(platforms.map((platform) => [platform.id, platform]));

  for (const platformId of selectedPlatformIds) {
    const platform = platformMap.get(platformId);
    if (!platform) continue;
    const spec = getSpecForPlatform(platform.type);
    const choice = spec ? buildChoicesFromSpec(spec)[0] : undefined;
    if (choice) result[platformId] = choice;
  }

  return result;
}

export function buildPreviewSpecs(
  selectedPlatformIds: string[],
  selectedRenditions: Record<string, RenditionChoice>
) {
  return Object.fromEntries(
    selectedPlatformIds
      .map((platformId) => {
        const choice = selectedRenditions[platformId];
        return choice ? [platformId, choice] : null;
      })
      .filter((entry): entry is [string, RenditionChoice] => entry !== null)
  );
}

export function buildCampaignPostContent(campaign: CampaignData) {
  const lines = [campaign.header, campaign.description, campaign.visualPrompt];
  if (campaign.animation && campaign.animation !== "none") {
    lines.push(`Animation: ${campaign.animation}`);
  }
  return lines.filter(Boolean).join("\n\n");
}
