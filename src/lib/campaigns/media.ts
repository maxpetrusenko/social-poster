import "server-only";

import crypto from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadMediaAsset } from "@/lib/storage/r2";

const CAMPAIGN_MEDIA_DIR = path.resolve(process.cwd(), "data", "campaign-media");

export type StoredCampaignMedia = {
  url: string;
  filename: string;
  contentType: string;
  width: number;
  height: number;
};

function ensureDir() {
  if (!existsSync(CAMPAIGN_MEDIA_DIR)) mkdirSync(CAMPAIGN_MEDIA_DIR, { recursive: true });
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

export async function storeCampaignMedia(input: {
  workspaceId: string;
  campaignId: string;
  bytes: Buffer;
  contentType: string;
  width?: number;
  height?: number;
}): Promise<StoredCampaignMedia> {
  const stored = await uploadMediaAsset({
    bytes: input.bytes,
    contentType: input.contentType,
    keyPrefix: `workspaces/${input.workspaceId}/campaigns/${input.campaignId}`,
    sourceName: `campaign-master.${extensionForContentType(input.contentType)}`,
  }).catch((error) => {
    console.warn("[campaign-media] R2 upload failed:", error instanceof Error ? error.message : error);
    return null;
  });

  const width = input.width ?? 2048;
  const height = input.height ?? 2048;
  if (stored?.url) {
    return {
      url: stored.url,
      filename: path.basename(stored.key),
      contentType: input.contentType,
      width,
      height,
    };
  }

  ensureDir();
  const filename = `${crypto.randomUUID()}.${extensionForContentType(input.contentType)}`;
  await writeFile(path.join(CAMPAIGN_MEDIA_DIR, filename), input.bytes);
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") || "";
  return {
    url: `${appUrl}/api/campaign-media/${filename}`,
    filename,
    contentType: input.contentType,
    width,
    height,
  };
}

export async function readCampaignMedia(filename: string) {
  if (!/^[\w-]+\.(png|jpe?g|webp)$/i.test(filename)) return null;
  const filePath = path.join(CAMPAIGN_MEDIA_DIR, filename);
  if (!filePath.startsWith(CAMPAIGN_MEDIA_DIR) || !existsSync(filePath)) return null;
  const bytes = await readFile(filePath);
  const lower = filename.toLowerCase();
  const contentType = lower.endsWith(".webp")
    ? "image/webp"
    : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
  return { bytes, contentType };
}
