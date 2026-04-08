const LATE_URL = "https://getlate.dev/api/v1/posts";

const ACCOUNT_IDS: Record<string, string> = {
  twitter: "690248619d65616f16a5c5bc",
  linkedin: "69024a4c9d65616f16a5c5c0",
  instagram: "69024a779d65616f16a5c5c1",
  tiktok: "6998bbc78ab8ae478b38b1cc",
  facebook: "69024a999d65616f16a5c5c2",
};

export interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
}

export interface PublishTarget {
  platform: string;
  accountId?: string | null;
  content: string;
  mediaUrl?: string;
  mediaType?: "video" | "image";
  instagramContentType?: "reel" | "story";
}

function getToken(): string {
  const t = process.env.LATE_API_KEY || process.env.GETLATE_DEV_API_KEY_FREE || process.env.GETLATE_API_KEY;
  if (!t) throw new Error("No LATE_API_KEY");
  return t;
}

function normalizePlatform(platform: string): string {
  const value = platform.toLowerCase();
  return value === "x" ? "twitter" : value;
}

export async function publishToLate(targets: PublishTarget[]): Promise<PublishResult[]> {
  const token = getToken();
  const results: PublishResult[] = [];

  for (const target of targets) {
    const platform = normalizePlatform(target.platform);
    const accountId = target.accountId || ACCOUNT_IDS[platform];
    if (!accountId) {
      results.push({ platform, success: false, error: `Unknown platform: ${platform}` });
      continue;
    }

    try {
      const platformEntry: Record<string, unknown> = { platform, accountId };

      if (platform === "instagram" && target.mediaUrl) {
        platformEntry.platformSpecificData = {
          contentType: target.instagramContentType || (target.mediaType === "video" ? "reel" : "story"),
        };
      }

      const body: Record<string, unknown> = {
        content: target.content,
        platforms: [platformEntry],
        publishNow: true,
      };

      if (target.mediaUrl) {
        body.mediaItems = [{ type: target.mediaType || "image", url: target.mediaUrl }];
      }

      const res = await fetch(LATE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        results.push({ platform, success: false, error: `${res.status}: ${err.slice(0, 200)}` });
        continue;
      }

      const data = (await res.json()) as Record<string, unknown>;
      const postObj = data.post as Record<string, unknown> | undefined;
      const postId = (postObj?._id || data.id || "") as string;
      console.log(`[publish] ${platform} → ${postId}`);
      results.push({ platform, success: true, postId });
    } catch (err) {
      results.push({ platform, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}
