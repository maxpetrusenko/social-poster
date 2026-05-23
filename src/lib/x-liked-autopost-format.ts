import type { BirdTweet } from "@/lib/replies/bird";

export type XLikedMedia = {
  url: string;
  mediaType: "image" | "video";
};

type JsonRecord = Record<string, unknown>;

function normalizeHandle(value: string) {
  return value.trim().replace(/^@/, "");
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const KNOWN_REPO_URLS: Array<{ pattern: RegExp; url: string; name: string }> = [
  {
    pattern: /\bfree\s*llm\s*api\b|\bfreellmapi\b/i,
    url: "https://github.com/tashfeenahmed/freellmapi",
    name: "FreeLLMAPI",
  },
];

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
  const isAiTopic = hasApprovedAiTopic(normalized);
  const isSourceOwnedLaunch = hasSourceOwnedLaunchSignal(text);

  if (/\b(fuck|fucking|shit|bitch|cunt|dick)\b/i.test(text)) {
    return "profanity";
  }

  if (/\b(trump|election|war|shooting|senate|congress|white house)\b/i.test(text)) {
    return "high controversy";
  }

  if (/\b(immigration|green card|visa|visas|washington|national security)\b/i.test(text) && !isAiTopic) {
    return "politics/news";
  }

  if (/^(breaking|new):/i.test(text) && !isAiTopic) {
    return "headline/news post";
  }

  if (
    /\b(try it now|npm i -g|install now|limited time|don't miss out)\b/i.test(text) &&
    !(isAiTopic && isSourceOwnedLaunch)
  ) {
    return "promotional copy";
  }

  if (text.length < 80) {
    return "too short/low context";
  }

  if (text.length < 160 && text.trim().endsWith("?")) {
    return "contextless question";
  }

  if (!isAiTopic) {
    return "outside approved topics";
  }

  return null;
}

function hasApprovedAiTopic(normalized: string) {
  return /\b(ai|agent|anthropic|code|coding|codex|claude|cursor|developer|data|frontier labs|gbrain|google|gpu|llm|meta|model|openai|deepseek|product|researcher|researchers|software|startup|automation|tools|training)\b/i.test(normalized);
}

export function getXLikedPostAngle(sourceText: string) {
  const text = cleanXLikedText(sourceText);
  const normalized = text.toLowerCase();
  const repo = extractGithubRepoSignal(text);

  if (repo) {
    return {
      label: "repo bookmark",
      take: buildRepoBookmarkTake(repo),
    };
  }

  if (/\b(visa|visas|green card|researcher|researchers|frontier labs|temporary visas|stay in the u\.s\.|stay in the us)\b/.test(normalized)) {
    return {
      label: "ai talent human cost",
      take: [
        "Some of the people building the most important systems in the world are also living with visa uncertainty in the background.",
        "",
        "That tension is hard to ignore.",
        "",
        "The future gets built by people who still have to ask whether they can stay.",
      ].join("\n"),
    };
  }

  if (/\b(qwen|benchmark|beats|training cost|bot improvement|agentic task|tetris bot)\b/.test(normalized)) {
    return {
      label: "video benchmark",
      take: buildVideoBenchmarkTake(text),
    };
  }

  if (/\b(price|cheap|cost|token|subscription|plan|discount|free|expensive|cad|\$)\b/.test(normalized)) {
    return {
      label: "model economics",
      take:
        "Model choice is becoming an architecture decision. Expensive model for planning, cheaper strong model for bulk execution, verifier on top.",
    };
  }

  if (/\b(train|training|dataset|gpu|a100|eval|validation|gguf|mlx|notebook|small model|slm)\b/.test(normalized)) {
    return {
      label: "small model workflow",
      take:
        "Small-model work is getting boring in the best way. The useful part is the loop: script it, check it overnight, repeat it with a tiny team.",
    };
  }

  if (/\b(agent|codex|cursor|claude|composer|orchestrator|executor|coding)\b/.test(normalized)) {
    return {
      label: "agent workflow",
      take:
        "The winning coding setup looks like a pipeline: planner, executor, verifier, critic. Teams that wire that loop well will move faster.",
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
      "Builder signal worth tracking: workflow changes show up first in the small loops people repeat every day.",
  };
}

function extractGithubRepoSignal(text: string) {
  const repoUrl = text.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i)?.[0];
  if (repoUrl) {
    const [, owner = "", repo = ""] =
      repoUrl.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i) ?? [];
    return {
      url: repoUrl.replace(/[).,]+$/, ""),
      name: repo ? repo.replace(/[-_]/g, " ") : `${owner}/${repo}`,
    };
  }

  const known = KNOWN_REPO_URLS.find((entry) => entry.pattern.test(text));
  return known ? { url: known.url, name: known.name } : null;
}

function buildRepoBookmarkTake(repo: { url: string; name: string }) {
  if (/freellmapi/i.test(repo.name) || /freellmapi/i.test(repo.url)) {
    return [
      "Save this if you prototype with LLM APIs.",
      "",
      "FreeLLMAPI gives you one OpenAI-compatible endpoint across multiple provider free tiers, with failover and per-key rate tracking.",
      "",
      "Useful when experiments need to keep running before paid infra makes sense.",
      "",
      repo.url,
    ].join("\n");
  }

  return [
    `Save this repo: ${repo.name}.`,
    "",
    "Useful developer tools earn bookmarks when they solve one repeated workflow clearly. This one is worth a look if it fits your stack.",
    "",
    repo.url,
  ].join("\n");
}

function buildVideoBenchmarkTake(text: string) {
  const modelRows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\bcost\b/i.test(line) && /\bimprovement\b/i.test(line))
    .slice(0, 4);

  if (modelRows.length >= 2) {
    return [
      "Agent-loop economics matters here: quality, cost per run, and iteration count.",
      "",
      "In a 10-iteration Tetris bot loop:",
      ...modelRows,
      "",
      "Long loops make cost per attempt matter as much as peak intelligence.",
    ].join("\n");
  }

  return "This matters as a cost curve signal. Long agent loops reward more attempts, strict verification, and expensive models used only where judgment matters.";
}

function hasSourceOwnedLaunchSignal(text: string) {
  return /\b((we|i)\s+(just\s+)?(launched|launching|shipped|released|rolled out|built)|introducing|now available|try it now|available today)\b/i.test(
    text
  );
}

function buildSourceOwnedLaunchTake(input: {
  handle: string;
  sourceUrl: string;
  sourceText: string;
  includeSource?: boolean;
}) {
  const source = `@${input.handle}`;
  const shipped = /\b(shipped|released|rolled out)\b/i.test(input.sourceText);
  const verb = shipped ? "shipped" : "launched";

  const lines = [
    `${source} ${verb} this.`,
    "",
    "Looks worth testing inside a real workflow. Strong take after hands-on time.",
  ];

  if (input.includeSource !== false) {
    lines.push("", `Source: ${source} ${input.sourceUrl}`);
  }

  return lines.join("\n");
}

export function buildXLikedPostContent(input: {
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
  includeSource?: boolean;
}) {
  const handle = normalizeHandle(input.authorHandle || "unknown");
  const angle = getXLikedPostAngle(input.sourceText);
  if (
    angle.label === "repo bookmark" ||
    angle.label === "ai talent human cost"
  ) {
    return angle.take;
  }

  if (angle.label === "video benchmark") {
    return input.includeSource === false
      ? angle.take
      : [
          angle.take,
          "",
          `Source: @${handle} ${input.sourceUrl}`,
        ].join("\n");
  }

  if (hasSourceOwnedLaunchSignal(input.sourceText)) {
    return buildSourceOwnedLaunchTake({
      handle,
      sourceUrl: input.sourceUrl,
      sourceText: input.sourceText,
      includeSource: input.includeSource,
    });
  }

  return input.includeSource === false
    ? angle.take
    : [
        angle.take,
        "",
        `Source: @${handle} ${input.sourceUrl}`,
      ].join("\n");
}

export function buildXLikedSourceComment(input: {
  authorHandle: string;
  sourceUrl: string;
}) {
  const handle = normalizeHandle(input.authorHandle || "unknown");
  return `Source: @${handle} ${input.sourceUrl}`;
}

export function buildXLikedPlatformPostContent(input: {
  baseContent: string;
  platformType: string;
  media: XLikedMedia | null;
  sourceUrl: string;
}) {
  const normalized = input.platformType.toLowerCase();
  const shouldEmbedSourceVideo =
    input.media?.mediaType === "video" &&
    (normalized === "x" || normalized === "twitter");

  if (!shouldEmbedSourceVideo) return input.baseContent;
  if (input.baseContent.includes(input.sourceUrl)) return input.baseContent;
  return [input.baseContent.trim(), "", input.sourceUrl].join("\n");
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

export function resolveXLikedPlatformMedia(
  platformType: string,
  media: XLikedMedia | null
): XLikedMedia | null {
  const normalized = platformType.toLowerCase();
  if (media?.mediaType === "video" && (normalized === "x" || normalized === "twitter")) {
    return null;
  }

  return media;
}

export function getXLikedExternalUrls(input: {
  tweet?: BirdTweet | null;
  sourceText: string;
}) {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return;
    if (urls.includes(normalized)) return;
    urls.push(normalized);
  };

  for (const value of readTweetUrlEntities(input.tweet)) {
    push(value);
  }

  for (const match of input.sourceText.matchAll(/https?:\/\/[^\s)]+/gi)) {
    push(match[0]);
  }

  const repo = extractGithubRepoSignal(input.sourceText);
  if (repo) {
    push(repo.url);
  }

  return urls;
}

function readTweetUrlEntities(tweet?: BirdTweet | null) {
  const raw = tweet?._raw;
  if (!raw || typeof raw !== "object") return [];

  const legacy = readRecord(raw, "legacy");
  const entities = readRecord(legacy, "entities");
  const urls = readArray(entities, "urls");

  return urls.flatMap((entry) => [
    readStringValue(entry, "expanded_url"),
    readStringValue(entry, "expandedUrl"),
    readStringValue(entry, "url"),
    readStringValue(readRecord(entry, "unwound"), "url"),
  ]);
}

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim().replace(/[).,]+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "x.com" || host === "twitter.com") return null;
  return url.toString();
}

function readRecord(source: unknown, key: string): JsonRecord {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const value = (source as JsonRecord)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readArray(source: JsonRecord, key: string): JsonRecord[] {
  const value = source[key];
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => {
        return Boolean(item && typeof item === "object" && !Array.isArray(item));
      })
    : [];
}

function readStringValue(source: unknown, key: string) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const value = (source as JsonRecord)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
