import "server-only";

import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignCreatives,
  campaignEvents,
  campaignGenerationSessions,
  campaignLayers,
  campaignRenditions,
  campaigns,
  platforms,
  postTargets,
  posts,
  profiles,
} from "@/db/schema";
import { getImageDimensions } from "@/lib/platform-specs";
import type { TenantContext } from "@/lib/tenancy";
import { generateCampaignImage } from "@/lib/campaigns/image-generation";

type CampaignRow = typeof campaigns.$inferSelect;
type CampaignCreativeRow = typeof campaignCreatives.$inferSelect;
type CampaignLayerRow = typeof campaignLayers.$inferSelect;
type CampaignRenditionRow = typeof campaignRenditions.$inferSelect;

export type CampaignDetail = CampaignRow & {
  profileName: string;
  creatives: Array<
    CampaignCreativeRow & {
      layers: CampaignLayerRow[];
      renditions: CampaignRenditionRow[];
    }
  >;
};

export async function listCampaignDetails(workspaceId: string, profileId?: string | null) {
  const conditions = [eq(campaigns.workspaceId, workspaceId)];
  if (profileId) conditions.push(eq(campaigns.profileId, profileId));

  const rows = await db
    .select({ campaign: campaigns, profileName: profiles.name })
    .from(campaigns)
    .innerJoin(profiles, eq(profiles.id, campaigns.profileId))
    .where(and(...conditions))
    .orderBy(campaigns.updatedAt);

  return hydrateCampaignDetails(rows.map((row) => ({
    ...row.campaign,
    profileName: row.profileName,
  })));
}

export async function getCampaignDetail(workspaceId: string, campaignId: string) {
  const row = await db
    .select({ campaign: campaigns, profileName: profiles.name })
    .from(campaigns)
    .innerJoin(profiles, eq(profiles.id, campaigns.profileId))
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)))
    .get();

  if (!row) return null;
  const [detail] = await hydrateCampaignDetails([{ ...row.campaign, profileName: row.profileName }]);
  return detail ?? null;
}

export async function assertProfileInWorkspace(workspaceId: string, profileId: string) {
  const profile = await db
    .select({ id: profiles.id, name: profiles.name, config: profiles.config })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.workspaceId, workspaceId)))
    .get();

  return profile ?? null;
}

export async function createCampaignEvent(input: {
  campaignId: string;
  creativeId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  actorUserId?: string | null;
}) {
  await db.insert(campaignEvents).values({
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    creativeId: input.creativeId ?? null,
    eventType: input.eventType,
    payload: input.payload ?? {},
    actorUserId: input.actorUserId ?? null,
    createdAt: new Date(),
  });
}

export async function createMockGeneration(tenant: TenantContext, campaignId: string) {
  const campaign = await getCampaignDetail(tenant.currentWorkspace.id, campaignId);
  if (!campaign) return null;

  const now = new Date();
  const sessionId = crypto.randomUUID();
  const creativeId = crypto.randomUUID();
  const title = `${campaign.name} Creative ${campaign.creatives.length + 1}`;
  const header = extractLine(campaign.brief, "Header") || campaign.name;
  const description =
    extractLine(campaign.brief, "Description") ||
    campaign.brief ||
    `Profile-aware creative for ${campaign.profileName}.`;
  const sourcePrompt = buildSourcePrompt(campaign, header, description);

  await db
    .update(campaigns)
    .set({ status: "generating", updatedAt: now })
    .where(eq(campaigns.id, campaign.id));

  const generatedImage = await generateCampaignImage({
    workspaceId: tenant.currentWorkspace.id,
    campaignId: campaign.id,
    prompt: sourcePrompt,
  });

  await db.insert(campaignGenerationSessions).values({
    id: sessionId,
    campaignId: campaign.id,
    status: "completed",
    inputSnapshot: {
      profileId: campaign.profileId,
      profileName: campaign.profileName,
      brief: campaign.brief,
      objective: campaign.objective,
      selectedPlatforms: campaign.selectedPlatforms ?? [],
    },
    modelConfig: {
      mode: generatedImage ? "gemini" : "mock",
      imageModel: generatedImage?.model ?? "mock-overscan-square",
    },
    resultSummary: {
      creativeCount: 1,
      note: generatedImage
        ? "Generated master campaign image with Gemini and stored it for rendition reuse."
        : "No Gemini image key/default was available, so a local mock creative was created.",
      imageUrl: generatedImage?.url ?? null,
      modelText: generatedImage?.text ?? null,
    },
    error: null,
    ledgerPath: null,
    createdAt: now,
    completedAt: now,
  });

  await db.insert(campaignCreatives).values({
    id: creativeId,
    campaignId: campaign.id,
    generationSessionId: sessionId,
    title,
    sourcePrompt,
    visualSpec: {
      subject: campaign.name,
      composition: "Centered subject with wide square overscan for platform crops.",
      overlayText: { header, description },
    },
    imageModel: generatedImage?.model ?? "mock",
    sourceImageUrl: generatedImage?.url ?? null,
    sourceImageWidth: generatedImage?.width ?? 2048,
    sourceImageHeight: generatedImage?.height ?? 2048,
    sourceFocalPoint: { x: 0.5, y: 0.46 },
    sourceSafeZone: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    score: { cropSafety: 0.8, brandFit: 0.7, promptAdherence: 0.7 },
    status: "review",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(campaignLayers).values([
    {
      id: crypto.randomUUID(),
      creativeId,
      kind: "header",
      text: header,
      mediaUrl: null,
      x: 120,
      y: 124,
      width: 1808,
      height: 240,
      rotation: 0,
      fontFamily: "serif",
      fontSize: 96,
      lineHeight: 108,
      color: "#ffffff",
      backgroundColor: null,
      visible: true,
      locked: false,
      zIndex: 10,
    },
    {
      id: crypto.randomUUID(),
      creativeId,
      kind: "description",
      text: description,
      mediaUrl: null,
      x: 180,
      y: 1580,
      width: 1688,
      height: 220,
      rotation: 0,
      fontFamily: "sans",
      fontSize: 54,
      lineHeight: 64,
      color: "#ffffff",
      backgroundColor: null,
      visible: true,
      locked: false,
      zIndex: 11,
    },
  ]);

  const selectedPlatformIds = campaign.selectedPlatforms ?? [];
  const platformRows = selectedPlatformIds.length
    ? await db
        .select({ id: platforms.id, type: platforms.type })
        .from(platforms)
        .where(inArray(platforms.id, selectedPlatformIds))
    : [];

  const platformTypes = platformRows.length
    ? Array.from(new Set(platformRows.map((platform) => platform.type)))
    : ["instagram", "x", "linkedin", "pinterest", "threads", "mastodon"];

  const renditions = platformTypes.flatMap((platformType) => {
    const dimensions = getImageDimensions(platformType);
    return dimensions.map((dimension) => ({
      id: crypto.randomUUID(),
      creativeId,
      platformType,
      format: dimension.label,
      width: dimension.width,
      height: dimension.height,
      aspectRatio: dimension.aspect,
      crop: { x: 0.5, y: 0.5, scale: 1, source: "mock-center-crop" },
      layerOverrides: {},
      exportedMediaUrl: null,
      validation: {
        status: "ready",
        maxSizeMb: dimension.maxSizeMb ?? null,
        note: "Ready for exact renderer export.",
      },
      status: "ready" as const,
      postId: null,
      postTargetId: null,
      createdAt: now,
      updatedAt: now,
    }));
  });

  if (renditions.length > 0) {
    await db.insert(campaignRenditions).values(renditions);
  }

  await db
    .update(campaigns)
    .set({
      status: "review",
      selectedCreativeId: creativeId,
      updatedAt: now,
    })
    .where(eq(campaigns.id, campaign.id));

  await createCampaignEvent({
    campaignId: campaign.id,
    creativeId,
    eventType: "creative.generated",
    payload: {
      sessionId,
      mode: generatedImage ? "gemini" : "mock",
      imageModel: generatedImage?.model ?? "mock",
      imageUrl: generatedImage?.url ?? null,
      renditionCount: renditions.length,
    },
    actorUserId: tenant.user.id,
  });

  return getCampaignDetail(tenant.currentWorkspace.id, campaign.id);
}

export async function applyCampaignToCalendar(
  tenant: TenantContext,
  input: {
    campaignId: string;
    creativeId?: string | null;
    platformIds?: string[];
    content?: string;
    intent?: string;
    scheduledAt?: string | null;
  }
) {
  const campaign = await getCampaignDetail(tenant.currentWorkspace.id, input.campaignId);
  if (!campaign) return { error: "Campaign not found", status: 404 as const };

  const creative =
    campaign.creatives.find((item) => item.id === input.creativeId) ??
    campaign.creatives.find((item) => item.id === campaign.selectedCreativeId) ??
    campaign.creatives[0];

  if (!creative) {
    return { error: "Generate or add a creative before applying this campaign.", status: 400 as const };
  }

  const platformIds = input.platformIds?.length ? input.platformIds : campaign.selectedPlatforms ?? [];
  if (platformIds.length === 0) {
    return { error: "Select at least one connected platform.", status: 400 as const };
  }

  const platformRows = await db
    .select({ id: platforms.id, type: platforms.type, workspaceId: platforms.workspaceId })
    .from(platforms)
    .where(inArray(platforms.id, platformIds));

  if (
    platformRows.length !== platformIds.length ||
    platformRows.some((platform) => platform.workspaceId !== tenant.currentWorkspace.id)
  ) {
    return { error: "One or more selected platforms are outside the current workspace.", status: 400 as const };
  }

  const now = new Date();
  const intent = input.intent === "schedule" ? "schedule" : "draft";
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (intent === "schedule" && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now)) {
    return { error: "A valid future schedule time is required.", status: 400 as const };
  }

  const layersByKind = new Map(creative.layers.map((layer) => [layer.kind, layer]));
  const header = layersByKind.get("header")?.text || creative.title || campaign.name;
  const description = layersByKind.get("description")?.text || campaign.brief;
  const content = input.content?.trim() || [header, description].filter(Boolean).join("\n\n");
  const mediaUrl = creative.renditions.find((rendition) => rendition.exportedMediaUrl)?.exportedMediaUrl ?? creative.sourceImageUrl;
  const postId = crypto.randomUUID();

  await db.insert(posts).values({
    id: postId,
    workspaceId: tenant.currentWorkspace.id,
    profileId: campaign.profileId,
    title: campaign.name,
    content,
    contentType: mediaUrl ? "image" : "text",
    mediaUrl: mediaUrl ?? null,
    sourceUrl: null,
    sourceTitle: campaign.name,
    status: intent === "schedule" ? "scheduled" : "draft",
    scheduledAt: intent === "schedule" ? scheduledAt : null,
    publishedAt: null,
    dedupKey: null,
    metadata: {
      campaignId: campaign.id,
      campaignCreativeId: creative.id,
      campaignRenditionIds: creative.renditions.map((rendition) => rendition.id),
      source: "campaign",
    },
    createdAt: now,
    updatedAt: now,
  });

  const targetEntries = platformIds.map((platformId) => ({
    id: crypto.randomUUID(),
    postId,
    platformId,
    status: "pending" as const,
    publishedUrl: null,
    platformPostId: null,
    error: null,
    publishedAt: null,
    createdAt: now,
  }));
  await db.insert(postTargets).values(targetEntries);

  const targetByPlatform = new Map(targetEntries.map((target) => [target.platformId, target]));
  for (const platform of platformRows) {
    const target = targetByPlatform.get(platform.id);
    const rendition = creative.renditions.find((item) => item.platformType === platform.type);
    if (target && rendition) {
      await db
        .update(campaignRenditions)
        .set({
          status: "applied",
          postId,
          postTargetId: target.id,
          updatedAt: now,
        })
        .where(eq(campaignRenditions.id, rendition.id));
    }
  }

  await db
    .update(campaigns)
    .set({
      status: intent === "schedule" ? "scheduled" : "approved",
      selectedCreativeId: creative.id,
      updatedAt: now,
    })
    .where(eq(campaigns.id, campaign.id));

  await createCampaignEvent({
    campaignId: campaign.id,
    creativeId: creative.id,
    eventType: intent === "schedule" ? "calendar.scheduled" : "calendar.draft_created",
    payload: { postId, platformIds, scheduledAt: scheduledAt?.toISOString() ?? null },
    actorUserId: tenant.user.id,
  });

  return { postId, targetCount: targetEntries.length, status: 201 as const };
}

async function hydrateCampaignDetails(
  campaignRows: Array<CampaignRow & { profileName: string }>
): Promise<CampaignDetail[]> {
  if (campaignRows.length === 0) return [];
  const campaignIds = campaignRows.map((campaign) => campaign.id);
  const creativeRows = await db
    .select()
    .from(campaignCreatives)
    .where(inArray(campaignCreatives.campaignId, campaignIds));

  const creativeIds = creativeRows.map((creative) => creative.id);
  const [layerRows, renditionRows]: [CampaignLayerRow[], CampaignRenditionRow[]] = creativeIds.length
    ? await Promise.all([
        db.select().from(campaignLayers).where(inArray(campaignLayers.creativeId, creativeIds)),
        db.select().from(campaignRenditions).where(inArray(campaignRenditions.creativeId, creativeIds)),
      ])
    : [[], []];

  const layersByCreative = groupBy(layerRows, (layer) => layer.creativeId);
  const renditionsByCreative = groupBy(renditionRows, (rendition) => rendition.creativeId);
  const creativesByCampaign = groupBy(creativeRows, (creative) => creative.campaignId);

  return campaignRows.map((campaign) => ({
    ...campaign,
    creatives: (creativesByCampaign.get(campaign.id) ?? []).map((creative) => ({
      ...creative,
      layers: layersByCreative.get(creative.id) ?? [],
      renditions: renditionsByCreative.get(creative.id) ?? [],
    })),
  }));
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function extractLine(value: string, field: string) {
  return value.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
}

function buildSourcePrompt(campaign: CampaignDetail, header: string, description: string) {
  return [
    `Campaign: ${campaign.name}`,
    `Profile: ${campaign.profileName}`,
    `Objective: ${campaign.objective || "social creative"}`,
    `Header: ${header}`,
    `Description: ${description}`,
    "Generate a square master image with the subject centered and pulled back enough for 1:1, 4:5, 1.91:1, 16:9, and 2:3 crops. Do not bake text into the image.",
  ].join("\n");
}
