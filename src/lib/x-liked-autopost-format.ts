import type { BirdTweet } from "@/lib/replies/bird";

export type XLikedMedia = {
  url: string;
  mediaType: "image" | "video";
};

function normalizeHandle(value: string) {
  return value.trim().replace(/^@/, "");
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decodeBasicHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function buildXLikedSourceUrl(tweet: Pick<BirdTweet, "id" | "url" | "author" | "authorId">) {
  if (tweet.url?.trim()) return tweet.url.trim();
  const author = normalizeHandle(tweet.author?.username || tweet.authorId || "unknown");
  return `https://x.com/${author}/status/${tweet.id || ""}`;
}

export function buildXLikedDedupKey(tweet: Pick<BirdTweet, "id" | "url" | "author" | "authorId">) {
  return `x-like:${tweet.id || buildXLikedSourceUrl(tweet)}`;
}

export function cleanXLikedText(text: string, options: { hasMedia?: boolean } = {}) {
  const normalized = decodeBasicHtmlEntities(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!options.hasMedia) return normalized;

  return normalized
    .replace(/\s+https:\/\/t\.co\/[A-Za-z0-9_]+$/g, "")
    .replace(/\n+https:\/\/t\.co\/[A-Za-z0-9_]+$/g, "")
    .trim();
}

export function getXLikedAutopostSkipReason(input: {
  sourceText: string;
  hasMedia?: boolean;
}) {
  const text = cleanXLikedText(input.sourceText, { hasMedia: input.hasMedia });
  const normalized = text.toLowerCase();

  if (/\b(fuck|fucking|shit|bitch|cunt|dick)\b/i.test(text)) {
    return "profanity";
  }

  if (/\b(trump|election|immigration|green card|war|shooting|senate|congress|white house)\b/i.test(text)) {
    return "politics/news";
  }

  if (/^(breaking|new):/i.test(text)) {
    return "headline/news post";
  }

  if (/\b(try it now|npm i -g|install now|limited time|don't miss out)\b/i.test(text)) {
    return "promotional copy";
  }

  if (text.length < 80) {
    return "too short/low context";
  }

  if (text.length < 160 && text.trim().endsWith("?")) {
    return "contextless question";
  }

  if (!/\b(ai|agent|code|coding|codex|claude|cursor|model|llm|gbrain|deepseek|openai|developer|data|gpu|training|tools|product|software|startup|automation)\b/i.test(normalized)) {
    return "outside approved topics";
  }

  return null;
}

export function getXLikedPostAngle(sourceText: string) {
  const text = cleanXLikedText(sourceText);
  const normalized = text.toLowerCase();

  if (/\b(price|cheap|cost|token|subscription|plan|discount|free|expensive|cad|\$)\b/.test(normalized)) {
    return {
      label: "model economics",
      take:
        "The useful signal is that model choice is becoming an architecture decision, not a loyalty decision. Expensive model for planning, cheaper strong model for bulk execution, verifier on top.",
    };
  }

  if (/\b(train|training|dataset|gpu|a100|eval|validation|gguf|mlx|notebook|small model|slm)\b/.test(normalized)) {
    return {
      label: "small model workflow",
      take:
        "Small-model work is getting boring in the best way. The interesting part is not one custom model, it is that the loop can be scripted, checked overnight, and repeated by a tiny team.",
    };
  }

  if (/\b(agent|codex|cursor|claude|composer|orchestrator|executor|coding)\b/.test(normalized)) {
    return {
      label: "agent workflow",
      take:
        "I do not think the winning coding setup is one model. It looks more like a pipeline: planner, executor, verifier, critic. The teams that wire that loop well will move faster.",
    };
  }

  if (/\b(product|ux|user experience|workflow|tool|tools|automation|build)\b/.test(normalized)) {
    return {
      label: "builder workflow",
      take:
        "This is the direction I care about: tools that compress the loop between seeing a problem, trying a fix, and learning whether it actually worked.",
    };
  }

  return {
    label: "builder signal",
    take:
      "Worth tracking as a builder signal. The important part is not the post itself, it is what it suggests about where the workflow is moving.",
  };
}

export function buildXLikedPostContent(input: {
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
}) {
  const handle = normalizeHandle(input.authorHandle || "unknown");
  const angle = getXLikedPostAngle(input.sourceText);

  return [
    angle.take,
    "",
    `Source: @${handle} ${input.sourceUrl}`,
  ].join("\n");
}

function pickTweetMedia(tweet: BirdTweet): XLikedMedia | null {
  for (const media of tweet.media ?? []) {
    const videoUrl = asString(media.videoUrl);
    if (videoUrl) {
      return { url: videoUrl, mediaType: "video" };
    }

    const url = asString(media.url) ?? asString(media.previewUrl);
    if (url) {
      const mediaType =
        media.type?.toLowerCase().includes("video") || /\.(mp4|mov|webm)(\?|$)/i.test(url)
          ? "video"
          : "image";
      return { url, mediaType };
    }
  }

  return null;
}

export function pickXLikedMedia(tweet: BirdTweet, fallbackImageUrl?: string | null): XLikedMedia | null {
  const direct = pickTweetMedia(tweet);
  if (direct) return direct;

  const quoted = tweet.quotedTweet ? pickTweetMedia(tweet.quotedTweet) : null;
  if (quoted) return quoted;

  if (fallbackImageUrl?.trim()) {
    return { url: fallbackImageUrl.trim(), mediaType: "image" };
  }

  return null;
}
