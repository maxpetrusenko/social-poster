import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { fetchOpenGraphImage } from "@/lib/open-graph-image";
import { isRenderableMediaUrl, mediaTypeFromContentType, mediaTypeFromUrl } from "@/lib/media-url";
import { readAccessToken } from "@/lib/providers/credentials";
import { getTweetImageUrl, readTweetForPlatform } from "@/lib/replies/bird";
import { isSafeRemoteHttpUrl, safeFetchRemote } from "@/lib/safe-remote-fetch";
import { uploadMediaAsset } from "@/lib/storage/r2";

const MAX_REMOTE_MEDIA_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const sourceUrl = parseHttpUrl(rawUrl);

    if (!sourceUrl) {
      return NextResponse.json({ error: "Paste a valid http or https URL." }, { status: 400 });
    }

    if (!(await isSafeRemoteHttpUrl(sourceUrl))) {
      return NextResponse.json({ error: "That media URL is not allowed." }, { status: 400 });
    }

    const directType = mediaTypeFromUrl(sourceUrl);
    if (directType) {
      return NextResponse.json({ url: sourceUrl, mediaType: directType, sourceUrl });
    }

    const xImageUrl = await resolveXImageUrl(sourceUrl, tenant.currentWorkspace.id);
    const ogImageUrl = xImageUrl ?? await fetchOpenGraphImage(sourceUrl);
    if (!ogImageUrl) {
      return NextResponse.json(
        { error: "Could not find an image on that page." },
        { status: 422 }
      );
    }

    const resolvedUrl = parseHttpUrl(ogImageUrl);
    if (!resolvedUrl) {
      return NextResponse.json(
        { error: "The page image URL is invalid." },
        { status: 422 }
      );
    }

    if (!(await isSafeRemoteHttpUrl(resolvedUrl))) {
      return NextResponse.json(
        { error: "The page image URL is not allowed." },
        { status: 422 }
      );
    }

    const hosted = await mirrorRemoteImage({
      sourceUrl: resolvedUrl,
      workspaceId: tenant.currentWorkspace.id,
    });

    if (hosted) {
      return NextResponse.json({
        url: hosted.url,
        sourceUrl,
        originalUrl: resolvedUrl,
        mediaType: "image",
      });
    }

    if (isRenderableMediaUrl(resolvedUrl)) {
      return NextResponse.json({
        url: resolvedUrl,
        sourceUrl,
        originalUrl: resolvedUrl,
        mediaType: "image",
      });
    }

    return NextResponse.json({
      url: `/api/og-image?${new URLSearchParams({ url: resolvedUrl }).toString()}`,
      sourceUrl,
      originalUrl: resolvedUrl,
      mediaType: "image",
    });
  } catch (error) {
    console.error("Media resolve failed:", error);
    return NextResponse.json({ error: "Media URL could not be resolved." }, { status: 500 });
  }
}

async function resolveXImageUrl(sourceUrl: string, workspaceId: string) {
  const parsed = new URL(sourceUrl);
  if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(parsed.hostname.toLowerCase())) {
    return null;
  }

  if (!/\/status\/\d+/.test(parsed.pathname)) return null;

  const tweetId = parsed.pathname.match(/\/status\/(\d+)/)?.[1];
  if (!tweetId) return null;

  const directPlatform = await db
    .select()
    .from(platforms)
    .where(
      and(
        eq(platforms.workspaceId, workspaceId),
        eq(platforms.provider, "direct"),
        inArray(platforms.type, ["x", "twitter"])
      )
    )
    .get();
  const accessToken = directPlatform ? readAccessToken(directPlatform.config) : null;
  if (accessToken) {
    const directImage = await resolveXImageUrlFromApi(tweetId, accessToken);
    if (directImage) return directImage;
  }

  const birdPlatform = await db
    .select()
    .from(platforms)
    .where(
      and(
        eq(platforms.workspaceId, workspaceId),
        eq(platforms.provider, "bird"),
        inArray(platforms.type, ["x", "twitter"])
      )
    )
    .get();

  if (!birdPlatform) return null;

  try {
    const tweet = await readTweetForPlatform(birdPlatform, sourceUrl, true);
    return tweet ? getTweetImageUrl(tweet) : null;
  } catch (error) {
    console.warn("[media-resolve] Bird could not resolve X image URL", error);
    return null;
  }
}

async function resolveXImageUrlFromApi(tweetId: string, accessToken: string) {
  const url = new URL(`https://api.x.com/2/tweets/${tweetId}`);
  url.searchParams.set("expansions", "attachments.media_keys");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      console.warn(`[media-resolve] X API media lookup failed: ${response.status} ${text.slice(0, 200)}`);
      return null;
    }

    const media = readArray(readRecord(body, "includes"), "media");
    for (const item of media) {
      const type = stringValue(item.type);
      const urlValue =
        type === "video"
          ? stringValue(item.preview_image_url)
          : stringValue(item.url) || stringValue(item.preview_image_url);
      if (urlValue) return urlValue;
    }
  } catch (error) {
    console.warn("[media-resolve] X API media lookup threw", error);
  }

  return null;
}

function readRecord(value: unknown, key?: string): Record<string, unknown> {
  const source = key && value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value;
  return source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : {};
}

function readArray(value: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const items = value[key];
  return Array.isArray(items) ? items.map((item) => readRecord(item)) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function mirrorRemoteImage({
  sourceUrl,
  workspaceId,
}: {
  sourceUrl: string;
  workspaceId: string;
}) {
  const response = await safeFetchRemote(sourceUrl, {
    headers: {
      "User-Agent": "social-poster/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);

  if (!response?.ok) return null;

  const contentType = response.headers.get("content-type");
  if (mediaTypeFromContentType(contentType) !== "image") return null;

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_REMOTE_MEDIA_BYTES) return null;

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_REMOTE_MEDIA_BYTES) return null;

  return uploadMediaAsset({
    bytes: Buffer.from(arrayBuffer),
    contentType: contentType || "image/jpeg",
    keyPrefix: `workspaces/${workspaceId}/posts/media`,
    sourceName: new URL(sourceUrl).pathname.split("/").pop() || "remote-image",
  });
}
