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
    <aside className="border-l border-[#2a2d25] bg-[#202324] p-5 text-[#e7ead7]">
      <div className="space-y-5">
        <div className="rounded-[18px] border border-[#303328] bg-[#242728]">
          <div className="flex items-center justify-between border-b border-[#303328] px-4 py-3">
            <p className="text-sm font-semibold text-[#f1f3e8]">Image</p>
            <span className="text-xs font-semibold text-[#a8b97b]">source</span>
          </div>
          <div className="flex justify-center p-4">
            <div className="relative h-32 w-32 overflow-hidden rounded-[10px] border border-[#5a604c] bg-[#141617]">
              {campaign.imageUrl ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url("${campaign.imageUrl}")` }}
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#c5d887,transparent_14%),linear-gradient(135deg,#263b31,#31424b_50%,#101112)]" />
              )}
              <div className="absolute inset-0 bg-black/20" />
              <span className="absolute bottom-2 right-2 rounded border border-[#c5d887]/70 bg-[#17191a]/80 px-2 py-0.5 text-[10px] font-semibold text-[#d8dacd]">
                Generated image
              </span>
            </div>
          </div>
        </div>

        <InspectorText title="Header" value={campaign.header} />
        <InspectorText title="Description" value={campaign.description} />

        <div className="flex items-center justify-between gap-3 border-b border-[#303328] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8b97b]">Delivery</p>
            <h3 className="mt-1 text-base font-semibold text-[#f1f3e8]">Targets and publish mode</h3>
          </div>
          <span className="rounded-full bg-[#303328] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c5d887]">
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
              className="mt-1 w-full rounded-[10px] border border-[#363a32] bg-[#17191a] px-3 py-2 text-sm text-[#f1f3e8] outline-none focus:border-[#c5d887]"
            />
          </label>
        ) : null}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8b97b]">Platforms</p>
          <div className="mt-2 space-y-2">
            {platforms.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[#3c4035] bg-[#17191a] px-3 py-4 text-sm text-[#a8aa9e]">
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
                        ? "border-[#c5d887] bg-[#c5d887] text-[#17191a]"
                        : "border-[#363a32] bg-[#17191a] text-[#e7ead7] hover:bg-[#262a24]"
                    } ${platform.enabled ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{platform.name}</p>
                        <p className={`truncate text-xs ${selected ? "text-[#303328]" : "text-[#a8aa9e]"}`}>
                          {meta.label}
                          {platform.handle ? ` · ${platform.handle}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          selected ? "bg-[#17191a]/12 text-[#17191a]" : "bg-[#303328] text-[#a8aa9e]"
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8b97b]">Renditions</p>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a8aa9e]">
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
                  <div key={platformId} className="rounded-[12px] border border-[#363a32] bg-[#17191a] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#f1f3e8]">{platform.name}</p>
                        <p className="text-xs text-[#a8aa9e]">{platform.type}</p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a8aa9e]">
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
                                ? "border-[#c5d887] bg-[#c5d887] text-[#17191a]"
                                : "border-[#45483c] bg-[#202324] text-[#d8dacd] hover:bg-[#2b2f28]"
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
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[#c5d887] bg-[#c5d887] px-3 py-3 text-sm font-semibold text-[#17191a] transition hover:bg-[#d2e593] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : publishMode === "publish" ? <Send className="h-4 w-4" /> : publishMode === "schedule" ? <CalendarClock className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {deliveryLabel}
          </button>
          {error ? (
            <p className="rounded-[10px] border border-[#6f392e] bg-[#2a1715] px-3 py-2 text-xs font-medium text-[#ffb19e]">
              {error}
            </p>
          ) : null}
          {statusMessage ? (
            <p className="rounded-[10px] border border-[#4f6044] bg-[#202719] px-3 py-2 text-xs font-medium text-[#c7dc88]">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <ActionButton icon={Wand2} label="Generate image" onClick={onGenerateImage} />
        <ActionButton icon={Check} label="Approve" onClick={onApprove} />
        <ActionButton icon={ThumbsDown} label="Deny" onClick={onDeny} />
        <ActionButton icon={Clapperboard} label="Animate" onClick={onAnimate} />
        <ActionButton icon={RefreshCw} label="Edit again" onClick={onEditAgain} />
        <div className="rounded-[12px] border border-[#363a32] bg-[#17191a] p-3 text-xs leading-5 text-[#a8aa9e]">
          Animation: <span className="font-semibold text-[#f1f3e8]">{campaign.animation}</span>
        </div>
      </div>
    </aside>
  );
}

function InspectorText({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#303328] bg-[#242728]">
      <div className="flex items-center justify-between border-b border-[#303328] px-4 py-3">
        <p className="text-sm font-semibold text-[#f1f3e8]">{title}</p>
        <span className="text-xs font-semibold text-[#a8b97b]">visible</span>
      </div>
      <div className="p-4">
        <p className="rounded-[10px] bg-[#17191a] px-3 py-3 text-sm leading-6 text-[#d8dacd]">{value}</p>
      </div>
    </div>
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
          ? "border-[#c5d887] bg-[#c5d887] text-[#17191a]"
          : "border-[#45483c] bg-[#17191a] text-[#d8dacd] hover:bg-[#262a24]"
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
      className="flex w-full items-center gap-2 rounded-[12px] border border-[#3c4035] bg-[#17191a] px-3 py-2.5 text-sm font-semibold text-[#e7ead7] hover:border-[#c5d887] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MetaLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[10px] border border-[#363a32] bg-[#17191a] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8b97b]">{label}</p>
      <p className={`mt-1 truncate text-[11px] ${mono ? "font-mono" : "font-medium"} text-[#e7ead7]`}>{value}</p>
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
