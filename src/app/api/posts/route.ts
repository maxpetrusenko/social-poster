import { db } from "@/db";
import { platforms, posts, postTargets, profiles } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import { readStringArray } from "@/lib/post-publish-metadata";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json();
    const {
      title,
      content,
      contentType,
      sourceUrl,
      sourceEvidenceId,
      sourceEvidenceSnapshot,
      scheduledAt,
      intent,
      profileId,
      platformIds,
      mediaUrl,
      mediaUrls,
      platformOverrides,
      previewSpecs,
      mediaUrlByPlatformId,
      mediaUrlByPlatformType,
      mediaUrlsByPlatformId,
      mediaUrlsByPlatformType,
    } = body;

    const normalizedMediaUrl =
      typeof mediaUrl === "string" && mediaUrl.trim() ? mediaUrl.trim() : null;
    const normalizedMediaUrls = readStringArray(mediaUrls);
    const normalizedMediaUrlsValue =
      normalizedMediaUrls.length > 0
        ? normalizedMediaUrls
        : normalizedMediaUrl
          ? [normalizedMediaUrl]
          : [];
    const normalizedContent =
      typeof content === "string" && content.trim() ? content : "";

    if (!normalizedContent && normalizedMediaUrlsValue.length === 0) {
      return NextResponse.json(
        { error: "Content or media is required" },
        { status: 400 }
      );
    }

    const postId = crypto.randomUUID();
    const now = new Date();
    const normalizedIntent =
      intent === "schedule" || intent === "publish" ? intent : "draft";
    const nextScheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    if (normalizedIntent === "schedule") {
      if (!nextScheduledAt || Number.isNaN(nextScheduledAt.getTime())) {
        return NextResponse.json(
          { error: "A valid schedule time is required" },
          { status: 400 }
        );
      }

      if (nextScheduledAt <= now) {
        return NextResponse.json(
          { error: "Schedule time must be in the future" },
          { status: 400 }
        );
      }
    }

    const status = normalizedIntent === "schedule" ? "scheduled" : "draft";
    const normalizedProfileId =
      typeof profileId === "string" && profileId.trim() ? profileId.trim() : null;

    const normalizedPlatformIds = Array.isArray(platformIds)
      ? Array.from(new Set(platformIds.filter((value: unknown): value is string => typeof value === "string")))
      : [];

    if (normalizedProfileId) {
      const matchingProfile = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.id, normalizedProfileId),
            eq(profiles.workspaceId, tenant.currentWorkspace.id)
          )
        )
        .get();

      if (!matchingProfile) {
        return NextResponse.json(
          { error: "Selected profile is outside the current workspace." },
          { status: 400 }
        );
      }
    }

    if (normalizedPlatformIds.length > 0) {
      const matchingPlatforms = await db
        .select({ id: platforms.id, workspaceId: platforms.workspaceId })
        .from(platforms)
        .where(inArray(platforms.id, normalizedPlatformIds));

      const allowedIds = new Set(
        matchingPlatforms
          .filter((platform) => platform.workspaceId === tenant.currentWorkspace.id)
          .map((platform) => platform.id)
      );

      if (allowedIds.size !== normalizedPlatformIds.length) {
        return NextResponse.json(
          { error: "One or more selected channels are outside the current workspace." },
          { status: 400 }
        );
      }
    }

    await db.insert(posts).values({
      id: postId,
      workspaceId: tenant.currentWorkspace.id,
      title: title || null,
      content: normalizedContent,
      contentType: contentType || "text",
      mediaUrl: normalizedMediaUrlsValue[0] ?? normalizedMediaUrl ?? null,
      sourceUrl: sourceUrl || null,
      sourceTitle: null,
      profileId: normalizedProfileId,
      status,
      scheduledAt: normalizedIntent === "schedule" ? nextScheduledAt : null,
      publishedAt: null,
      dedupKey: null,
      metadata: buildPostMetadata({
        platformOverrides,
        previewSpecs,
        mediaUrls: normalizedMediaUrlsValue,
        mediaUrlsByPlatformId: mediaUrlsByPlatformId ?? mediaUrlByPlatformId,
        mediaUrlsByPlatformType: mediaUrlsByPlatformType ?? mediaUrlByPlatformType,
        sourceEvidenceId,
        sourceEvidenceSnapshot,
      }),
      createdAt: now,
      updatedAt: now,
    });

    if (normalizedPlatformIds.length > 0) {
      const targetEntries = normalizedPlatformIds.map((platformId: string) => ({
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
    }

    await recordTenantAuditEvent(tenant, {
      action: normalizedIntent === "schedule" ? "post.schedule" : "post.create",
      targetType: "post",
      targetId: postId,
      metadata: {
        status,
        endpoint: "POST /api/posts",
        platformTargetCount: normalizedPlatformIds.length,
        scheduledAt: nextScheduledAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json(
      {
        id: postId,
        message: "Post created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildPostMetadata(input: {
  platformOverrides: unknown;
  previewSpecs: unknown;
  mediaUrls: string[];
  mediaUrlsByPlatformId: unknown;
  mediaUrlsByPlatformType: unknown;
  sourceEvidenceId?: unknown;
  sourceEvidenceSnapshot?: unknown;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    platformOverrides: sanitizeRecord(input.platformOverrides),
    previewSpecs: sanitizeRecord(input.previewSpecs),
    mediaUrls: input.mediaUrls,
    mediaUrlsByPlatformId: normalizeStringArrayMap(input.mediaUrlsByPlatformId),
    mediaUrlsByPlatformType: normalizeStringArrayMap(input.mediaUrlsByPlatformType),
  };

  const normalizedSourceEvidenceId =
    typeof input.sourceEvidenceId === "string" && input.sourceEvidenceId.trim()
      ? input.sourceEvidenceId.trim()
      : "";
  if (normalizedSourceEvidenceId) {
    metadata.sourceEvidenceId = normalizedSourceEvidenceId;
  }

  const normalizedSourceEvidenceSnapshot = sanitizeRecord(input.sourceEvidenceSnapshot);
  if (Object.keys(normalizedSourceEvidenceSnapshot).length > 0) {
    metadata.sourceEvidenceSnapshot = normalizedSourceEvidenceSnapshot;
  }

  return metadata;
}

function normalizeStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output: Record<string, string[]> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = readStringArray(item);
    if (normalized.length > 0) {
      output[key] = normalized;
    }
  }

  return output;
}
