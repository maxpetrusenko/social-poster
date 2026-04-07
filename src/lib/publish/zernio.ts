const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY ?? "";
const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

const ACCOUNT_IDS: Record<string, string | undefined> = {
  twitter: process.env.ZERNIO_TWITTER_ACCOUNT_ID,
  linkedin: process.env.ZERNIO_LINKEDIN_ACCOUNT_ID,
  instagram: process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID,
  tiktok: process.env.ZERNIO_TIKTOK_ACCOUNT_ID,
  facebook: process.env.ZERNIO_FACEBOOK_ACCOUNT_ID,
};

export type ZernioPostResult = {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
};

export async function publishToZernio(opts: {
  platform: string;
  content: string;
  mediaUrl?: string | null;
}): Promise<ZernioPostResult> {
  const { platform, content, mediaUrl } = opts;
  const accountId = ACCOUNT_IDS[platform];

  if (!accountId) {
    return { platform, success: false, error: `No Zernio account ID for ${platform}` };
  }
  if (!ZERNIO_API_KEY) {
    return { platform, success: false, error: "ZERNIO_API_KEY not set" };
  }

  try {
    const body: Record<string, unknown> = {
      content,
      platforms: [{ platform, accountId }],
    };
    if (mediaUrl) {
      body.mediaItems = [{ type: "image", url: mediaUrl }];
    }

    const res = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZERNIO_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return { platform, success: false, error: `Non-JSON response (${res.status}): ${text.slice(0, 200)}` };
    }

    if (!res.ok) {
      return {
        platform,
        success: false,
        error: (data?.message ?? data?.error ?? `HTTP ${res.status}`) as string,
      };
    }
    return {
      platform,
      success: true,
      postId: (data?.id ?? data?.postId) as string | undefined,
      postUrl: (data?.url ?? data?.postUrl) as string | undefined,
    };
  } catch (err) {
    return { platform, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
