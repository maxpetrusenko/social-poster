"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, CopyCheck, Download, History, Scissors } from "lucide-react";
import type { Profile } from "./profile-workspace-config";
import {
  CampaignDeliveryPanel,
  buildCampaignPostContent,
  buildDefaultRenditions,
  buildPlatformRenditions,
  defaultScheduledAt,
  type CampaignData,
  type ConnectedPlatform,
  type PublishMode,
  type RenditionChoice,
} from "./profile-campaign-delivery-panel";

export type CampaignCreativeLayer = {
  kind: string;
  text: string;
  mediaUrl: string | null;
};

export type CampaignCreativeDetail = {
  id: string;
  title: string;
  sourceImageUrl: string | null;
  sourceImageWidth: number;
  sourceImageHeight: number;
  status: string;
  layers: CampaignCreativeLayer[];
  renditions: Array<{
    id: string;
    exportedMediaUrl: string | null;
    platformType: string;
    status: string;
  }>;
};

export type CampaignDetail = {
  id: string;
  profileId: string;
  profileName: string;
  name: string;
  status: string;
  brief: string;
  objective: string;
  selectedPlatforms: string[] | null;
  selectedCreativeId: string | null;
  creatives: CampaignCreativeDetail[];
};

const CROP_PRESETS = [
  { label: "IG square", size: "1080x1080", ratio: "1 / 1", x: "50%", y: "50%" },
  { label: "IG portrait", size: "1080x1350", ratio: "4 / 5", x: "50%", y: "48%" },
  { label: "IG landscape", size: "1080x566", ratio: "1.91 / 1", x: "50%", y: "52%" },
  { label: "X wide", size: "1600x900", ratio: "16 / 9", x: "50%", y: "50%" },
  { label: "Pinterest", size: "1000x1500", ratio: "2 / 3", x: "50%", y: "46%" },
];

export function CampaignEditor({
  profile,
  platforms = [],
  value,
  onChange,
  campaignId,
  campaignRecord,
  onCampaignRecordChange = () => {},
}: {
  profile: Profile;
  platforms?: ConnectedPlatform[];
  value: string;
  onChange: (value: string) => void;
  campaignId?: string | null;
  campaignRecord?: CampaignDetail | null;
  onCampaignRecordChange?: (campaign: CampaignDetail | null) => void;
}) {
  const campaign = useMemo(() => parseCampaign(value, profile), [profile, value]);
  const linkedCampaignId = campaign.campaignId || campaignId || campaignRecord?.id || "";
  const artStyle = buildArtStyle(campaign.imageSeed, profile.name);
  const platformRenditions = useMemo(() => buildPlatformRenditions(platforms), [platforms]);
  const defaultSelectedPlatformIds = useMemo(() => {
    if (campaignRecord?.selectedPlatforms?.length) return campaignRecord.selectedPlatforms;
    return platforms.filter((platform) => platform.enabled).map((platform) => platform.id);
  }, [campaignRecord?.selectedPlatforms, platforms]);

  const [selectedPlatformIds, setSelectedPlatformIds] = useState<string[]>(() =>
    defaultSelectedPlatformIds.length > 0
      ? defaultSelectedPlatformIds
      : platforms.map((platform) => platform.id)
  );
  const [selectedRenditions, setSelectedRenditions] = useState<Record<string, RenditionChoice>>(() =>
    buildDefaultRenditions(platforms, selectedPlatformIds)
  );
  const [publishMode, setPublishMode] = useState<PublishMode>("draft");
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduledAt());
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof CampaignData, nextValue: string) {
    setError(null);
    setStatusMessage(null);
    onChange(serializeCampaign({ ...campaign, [key]: nextValue }, value));
  }

  async function ensureLinkedCampaign() {
    if (linkedCampaignId) return linkedCampaignId;

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile.id,
        name: campaign.title,
        brief: value,
        objective: "social campaign",
        selectedPlatforms: selectedPlatformIds,
      }),
    });
    const data = (await response.json().catch(() => null)) as { campaign?: CampaignDetail; error?: string } | null;
    if (!response.ok || !data?.campaign) {
      throw new Error(data?.error || "Failed to create campaign link.");
    }

    onCampaignRecordChange(data.campaign);
    onChange(serializeCampaign({ ...campaign, campaignId: data.campaign.id }, value));
    return data.campaign.id;
  }

  async function regenerate() {
    const seed = `${campaign.title}-${Date.now().toString(36)}`;
    setError(null);
    setStatusMessage(null);
    try {
      const campaignIdForRequest = await ensureLinkedCampaign();
      const response = await fetch(`/api/campaigns/${campaignIdForRequest}/generate`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { campaign?: CampaignDetail; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate campaign creative.");
      }

      if (data?.campaign) {
        onCampaignRecordChange(data.campaign);
        const nextCampaign = campaignFromDetail(data.campaign, { ...campaign, imageSeed: seed });
        onChange(serializeCampaign(nextCampaign, value));
      } else {
        onChange(serializeCampaign({ ...campaign, imageSeed: seed, status: "draft" }, value));
      }

      setStatusMessage("Image generated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to generate campaign creative.");
    }
  }

  function togglePlatform(platformId: string) {
    setError(null);
    setStatusMessage(null);
    setSelectedPlatformIds((current) => {
      const next = current.includes(platformId)
        ? current.filter((id) => id !== platformId)
        : [...current, platformId];

      setSelectedRenditions((existing) => {
        const nextRenditions = { ...existing };
        if (!next.includes(platformId)) {
          delete nextRenditions[platformId];
          return nextRenditions;
        }

        if (!nextRenditions[platformId]) {
          const defaultChoice = platformRenditions.get(platformId)?.[0];
          if (defaultChoice) nextRenditions[platformId] = defaultChoice;
        }

        return nextRenditions;
      });

      return next;
    });
  }

  function selectRendition(platformId: string, choice: RenditionChoice) {
    setError(null);
    setStatusMessage(null);
    setSelectedRenditions((current) => ({ ...current, [platformId]: choice }));
  }

  async function deliverCampaign() {
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const campaignIdForRequest = await ensureLinkedCampaign();

      if (selectedPlatformIds.length === 0) {
        throw new Error("Select at least one platform.");
      }

      if (publishMode === "schedule" && !scheduledAt) {
        throw new Error("Choose a calendar time.");
      }

      const intent = publishMode === "publish" ? "draft" : publishMode;
      const response = await fetch(`/api/campaigns/${campaignIdForRequest}/apply-to-calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creativeId: campaignRecord?.selectedCreativeId ?? undefined,
          content: buildCampaignPostContent(campaign),
          platformIds: selectedPlatformIds,
          intent,
          scheduledAt: intent === "schedule" ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as { postId?: string; targetCount?: number; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Failed to apply campaign to calendar.");
      }

      const nextStatus = intent === "schedule" ? "scheduled" : "draft";
      onChange(serializeCampaign({ ...campaign, campaignId: campaignIdForRequest, status: nextStatus }, value));

      if (publishMode === "publish" && data?.postId) {
        const publishResponse = await fetch(`/api/posts/${data.postId}/publish`, { method: "POST" });
        const publishData = (await publishResponse.json().catch(() => null)) as { error?: string } | null;
        if (!publishResponse.ok) {
          throw new Error(publishData?.error || "Draft saved, but publish failed.");
        }
        onChange(serializeCampaign({ ...campaign, campaignId: campaignIdForRequest, status: "approved" }, value));
      }

      const refreshed = await fetch(`/api/campaigns/${campaignIdForRequest}`);
      const refreshedData = (await refreshed.json().catch(() => null)) as { campaign?: CampaignDetail } | null;
      if (refreshed.ok && refreshedData?.campaign) {
        onCampaignRecordChange(refreshedData.campaign);
      }

      setStatusMessage(publishMode === "publish" ? "Published." : publishMode === "schedule" ? "Added to calendar." : "Draft saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid min-h-[660px] gap-0 bg-[#17191a] text-[#e7ead7] xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-7 px-5 py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-[#3c4035] bg-[#141617] px-4 py-2 text-sm font-semibold text-[#c5d887]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to campaigns
          </button>
          <div className="inline-flex items-center gap-3 rounded-full border border-[#3c4035] bg-[#141617] px-4 py-2 text-sm font-semibold text-[#d8dacd]">
            <History className="h-4 w-4 text-[#a8b97b]" />
            <span>Version history</span>
            <span className="text-[#c5d887]">2 / 2</span>
          </div>
        </div>

        <div className="mx-auto max-w-[980px] text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a8b97b]">{profile.name}</p>
          <h2 className="mt-2 font-serif text-4xl font-semibold italic text-[#f2f4eb]">{campaign.title}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#b7baae]">{campaign.description}</p>
        </div>

        <div className="mx-auto max-w-[820px] space-y-6">
          <div className="mx-auto w-full max-w-[430px]">
            <div className="rounded-[16px] border border-[#3c4035] bg-[#222620] p-2 shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
              <PosterCanvas campaign={campaign} artStyle={artStyle} ratio="1 / 1" safeZone />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void regenerate()}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#c5d887] px-4 text-sm font-semibold text-[#17191a]"
              >
                <Scissors className="h-4 w-4" />
                Fix layout
              </button>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#4a5039] text-[#c5d887]"
                aria-label="Download source image"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[18px] border border-[#3c4035] bg-[#202324] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8b97b]">Copy</p>
                  <p className="text-sm text-[#a8aa9e]">{linkedCampaignId ? `DB campaign ${linkedCampaignId.slice(0, 8)}` : "Local campaign"}</p>
                </div>
                <span className="rounded-full border border-[#4b503f] bg-[#17191a] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#c5d887]">
                  {campaign.status}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <LabeledField label="Header" value={campaign.header} onChange={(value) => updateField("header", value)} />
                <LabeledField label="Description" value={campaign.description} onChange={(value) => updateField("description", value)} textarea />
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-semibold text-[#b7baae]">Visual prompt</span>
                <textarea
                  value={campaign.visualPrompt}
                  onChange={(event) => updateField("visualPrompt", event.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-[10px] border border-[#363a32] bg-[#17191a] px-3 py-2 text-sm text-[#f1f3e8] outline-none focus:border-[#c5d887]"
                />
              </label>
            </div>

            <div className="rounded-[18px] border border-[#3c4035] bg-[#202324] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#f1f3e8]">
                <CopyCheck className="h-4 w-4 text-[#a8b97b]" />
                Platform crops
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {CROP_PRESETS.map((preset) => (
                  <div key={preset.label} className="overflow-hidden rounded-[12px] border border-[#34382f] bg-[#17191a] p-2">
                    <PosterCanvas campaign={campaign} artStyle={artStyle} ratio={preset.ratio} cropX={preset.x} cropY={preset.y} small />
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#e7ead7]">{preset.label}</span>
                      <span className="text-[#a8aa9e]">{preset.size}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CampaignDeliveryPanel
        campaign={campaign}
        campaignId={linkedCampaignId || null}
        platforms={platforms}
        selectedPlatformIds={selectedPlatformIds}
        selectedRenditions={selectedRenditions}
        platformRenditions={platformRenditions}
        publishMode={publishMode}
        scheduledAt={scheduledAt}
        saving={saving}
        statusMessage={statusMessage}
        error={error}
        onPublishModeChange={setPublishMode}
        onScheduledAtChange={setScheduledAt}
        onTogglePlatform={togglePlatform}
        onSelectRendition={selectRendition}
        onDeliver={deliverCampaign}
        onGenerateImage={regenerate}
        onApprove={() => updateField("status", "approved")}
        onDeny={() => updateField("status", "denied")}
        onAnimate={() => updateField("animation", "requested")}
        onEditAgain={() => updateField("status", "needs edit")}
      />
    </div>
  );
}

function PosterCanvas({
  campaign,
  artStyle,
  ratio,
  cropX = "50%",
  cropY = "50%",
  safeZone,
  small,
}: {
  campaign: CampaignData;
  artStyle: CSSProperties;
  ratio: string;
  cropX?: string;
  cropY?: string;
  safeZone?: boolean;
  small?: boolean;
}) {
  const sourceStyle: CSSProperties = campaign.imageUrl
    ? {
        backgroundImage: `url("${campaign.imageUrl}")`,
        backgroundSize: "cover",
      }
    : artStyle;
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-[#4b503f] bg-[#101112]" style={{ aspectRatio: ratio }}>
      <div className="absolute inset-[-14%]" style={{ ...sourceStyle, backgroundPosition: `${cropX} ${cropY}` }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.20)_45%,rgba(0,0,0,0.76))]" />
      {safeZone ? <div className="absolute inset-[12%] rounded-[8px] border border-dashed border-[#c5d887]/50" /> : null}
      <div className="absolute inset-x-4 bottom-4 text-center text-white">
        <p className={`${small ? "text-[11px]" : "text-xl"} font-bold leading-tight drop-shadow`}>{campaign.header}</p>
        {!small ? <p className="mt-2 text-sm font-medium leading-snug text-white/88">{campaign.description}</p> : null}
      </div>
    </div>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#b7baae]">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="mt-1 w-full resize-none rounded-[10px] border border-[#363a32] bg-[#17191a] px-3 py-2 text-sm text-[#f1f3e8] outline-none focus:border-[#c5d887]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full rounded-[10px] border border-[#363a32] bg-[#17191a] px-3 py-2 text-sm text-[#f1f3e8] outline-none focus:border-[#c5d887]"
        />
      )}
    </label>
  );
}

export function parseCampaign(value: string, profile: Profile): CampaignData {
  const title = value.match(/^#\s+(.+)$/m)?.[1]?.trim() || `${profile.name} Campaign`;
  return {
    title,
    status: readField(value, "Status") || "draft",
    header: readField(value, "Header") || title,
    description: readField(value, "Description") || `A profile-aware creative concept for ${profile.name}.`,
    visualPrompt: readField(value, "Visual prompt") || "Wide source image with extra room for platform crops.",
    imageSeed: readField(value, "Image seed") || title,
    animation: readField(value, "Animation") || "none",
    campaignId: readField(value, "Campaign ID"),
    imageUrl: readField(value, "Image URL"),
  };
}

export function serializeCampaign(campaign: CampaignData, original: string) {
  const bodyStart = original.indexOf("## Platform Crops");
  const tail = bodyStart >= 0 ? original.slice(bodyStart) : "";
  const headerLines = [`# ${campaign.title}`, ""];
  if (campaign.campaignId) headerLines.push(`Campaign ID: ${campaign.campaignId}`);
  headerLines.push(
    `Status: ${campaign.status}`,
    `Header: ${campaign.header}`,
    `Description: ${campaign.description}`,
    `Visual prompt: ${campaign.visualPrompt}`,
    `Image seed: ${campaign.imageSeed}`
  );
  if (campaign.imageUrl) headerLines.push(`Image URL: ${campaign.imageUrl}`);
  headerLines.push(`Animation: ${campaign.animation}`);
  return `${headerLines.join("\n")}\n\n${tail.trimEnd()}\n`;
}

export function campaignFromDetail(detail: CampaignDetail, fallback: CampaignData): CampaignData {
  const creative = detail.creatives.find((item) => item.id === detail.selectedCreativeId) ?? detail.creatives[0];
  const header = creative?.layers.find((layer) => layer.kind === "header")?.text || fallback.header;
  const description = creative?.layers.find((layer) => layer.kind === "description")?.text || fallback.description;
  const imageUrl =
    creative?.renditions.find((rendition) => rendition.exportedMediaUrl)?.exportedMediaUrl ??
    creative?.sourceImageUrl ??
    fallback.imageUrl;
  return {
    ...fallback,
    campaignId: detail.id,
    status: detail.status || fallback.status,
    title: detail.name || fallback.title,
    header,
    description,
    imageUrl,
  };
}

function readField(value: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.match(new RegExp(`^${escaped}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
}

function buildArtStyle(seed: string, profileName: string): CSSProperties {
  const hash = `${seed}-${profileName}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = hash % 360;
  return {
    backgroundImage:
      `radial-gradient(circle at 50% 42%, hsla(${hue}, 78%, 62%, 0.88), transparent 8%), ` +
      `radial-gradient(circle at 52% 45%, rgba(255,255,255,0.9), transparent 11%), ` +
      `linear-gradient(135deg, hsl(${hue}, 32%, 18%), hsl(${(hue + 70) % 360}, 22%, 34%) 42%, hsl(${(hue + 140) % 360}, 25%, 12%))`,
    backgroundSize: "cover",
  };
}
