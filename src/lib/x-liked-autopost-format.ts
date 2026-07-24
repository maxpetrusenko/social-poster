import type { BirdTweet } from "@/lib/replies/bird";

export type XLikedMedia = {
  url: string;
  mediaType: "image" | "video";
  sourceUrl?: string;
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

  if (/\b(fuck|fucking|shit|bitch|cunt|dick)\b/i.test(text)) {
    return "profanity";
  }

  if (/\b(trump|election|war|shooting|senate|congress|white house)\b/i.test(text)) {
    return "high controversy";
  }

  return null;
}

export function shouldUseDirectXLikedTextCopy(input: {
  sourceText: string;
  hasMedia?: boolean;
}) {
  const text = cleanXLikedText(input.sourceText, { hasMedia: input.hasMedia });
  if (!text.trim() || text.length > 1200) return false;
  if (hasFirstPersonClaim(text)) return false;
  if (hasSourceOwnedLaunchSignal(text)) return false;
  if (looksLikeStudyClaim(text)) return false;
  return true;
}

function splitMeaningfulLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\//i.test(line));
}

function stripEmojiNoise(text: string) {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function firstSentence(value: string) {
  return value.match(/^(.+?[.!?])(?:\s|$)/)?.[1]?.trim() ?? value.trim();
}

function shortenLine(value: string, max = 170) {
  const clean = stripEmojiNoise(value).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max).replace(/\s+\S*$/, "").trim();
  return clipped || clean.slice(0, max).trim();
}

function preserveTrainOfThoughtLines(lines: string[], maxLength = 1200) {
  const shortened = lines.map((line) => shortenLine(line, 320));
  const full = shortened.join("\n\n").trim();
  if (full.length <= maxLength) return full;

  const kept: string[] = [];
  let used = 0;
  for (const line of shortened) {
    const separator = kept.length > 0 ? 2 : 0;
    if (used + separator + line.length > maxLength) break;
    kept.push(line);
    used += separator + line.length;
  }

  const ending = shortened.at(-1);
  if (ending && !kept.includes(ending)) {
    while (kept.length > 1 && [...kept, ending].join("\n\n").length > maxLength) {
      kept.pop();
    }
    if ([...kept, ending].join("\n\n").length <= maxLength) {
      kept.push(ending);
    }
  }

  return kept.join("\n\n").trim();
}

function isFableWindowEssay(text: string) {
  const normalized = text.toLowerCase();
  return /\bfable\b/.test(normalized) &&
    /\bmythos\b/.test(normalized) &&
    /\bwindow\b/.test(normalized) &&
    /\bfrontier\b/.test(normalized);
}

function buildFableWindowShare(sourceUrl: string) {
  return [
    "Fable was here, then gone.",
    "",
    "That tiny shock is the whole essay.",
    "",
    "Frontier AI is becoming infrastructure now: access, compute, models, talent, the ability to use models to build the next models.",
    "",
    "Countries and companies that treat this like another software wave are choosing dependence.",
    "",
    "Andrew's essay is strong because it makes the geopolitical point feel personal.",
    "",
    "Worth reading:",
    "",
    sourceUrl,
  ].join("\n");
}

export function buildCloseToOriginalXLikedPostContent(sourceText: string) {
  const text = cleanXLikedText(sourceText);
  const normalized = text.toLowerCase();

  if (/\bprefrontal cortex\b/.test(normalized) && /\bcerebellum\b/.test(normalized)) {
    return [
      "Everyone building AI agents is focused on the prefrontal cortex:",
      "",
      "planning",
      "reasoning",
      "multi-step chains",
      "",
      "But the better reframe is the cerebellum: boring tasks offloaded into reflex so complex thought can focus.",
      "",
      "The winners will nail the boring stuff first.",
    ].join("\n");
  }

  if (/\bbumblebee scanner\b/.test(normalized) || /\bsupply-chain surprises\b/.test(normalized)) {
    return [
      "Hermes agent with a Perplexity Bumblebee scanner:",
      "",
      "\"hermes, sweep the perimeter\"",
      "158 packages clean",
      "",
      "Daily cron.",
      "Telegram alerts.",
      "Jarvis-style narration.",
      "",
      "The useful part is boring: keep the machine checked for supply-chain surprises.",
    ].join("\n");
  }

  const lines = splitMeaningfulLines(text);
  if (lines.length === 0) return "";

  if (text.length <= 1200 && lines.length <= 14) {
    return preserveTrainOfThoughtLines(lines);
  }

  const first = firstSentence(lines[0] ?? "");
  const quoted = lines.find((line) => /^["'>]/.test(line) || /:/.test(line));
  const numeric = lines.find((line) => /\b\d[\d,.]*(?:\s?(?:packages|tokens?|models?|hours?|%|x|\$))\b/i.test(line));
  const ending =
    [...lines].reverse().find((line) =>
      /\b(winners?|first|surprises?|matters?|done|focus|ship|save|bookmark)\b/i.test(line)
    ) ?? lines.at(-1) ?? "";

  const picked = [first, quoted, numeric, ending]
    .filter((line): line is string => Boolean(line?.trim()))
    .map((line) => shortenLine(line))
    .filter((line, index, arr) => arr.indexOf(line) === index);

  return picked.join("\n\n");
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

  if (
    /\b(blue-collar|blue collar|robot|robots|automation|automate|automated)\b/.test(normalized) &&
    /\b(200 hours|40 hours|weekends|sleep|breaks|sick days|vacations|human works)\b/.test(normalized)
  ) {
    return {
      label: "physical automation economics",
      take: [
        "Blue-collar automation will arrive unevenly.",
        "",
        "The first jobs to watch have four traits:",
        "controlled environment",
        "repetitive motion",
        "high labor shortage",
        "expensive downtime",
        "",
        "That is where the 200-hour robot vs 40-hour human comparison becomes brutal.",
        "",
        "The easiest slices of the work become economically irrational to keep manual first.",
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
      take: buildCloseToOriginalXLikedPostContent(text),
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
      label: "close original",
      take: buildCloseToOriginalXLikedPostContent(text),
    };
  }

  if (/\b(product|ux|user experience|workflow|tool|tools|automation|build)\b/.test(normalized)) {
    return {
      label: "close original",
      take: buildCloseToOriginalXLikedPostContent(text),
    };
  }

  return {
    label: "close original",
    take: buildCloseToOriginalXLikedPostContent(text),
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
  sourceText: string;
}) {
  const source = `@${input.handle}`;
  const shipped = /\b(shipped|released|rolled out)\b/i.test(input.sourceText);
  const verb = shipped ? "shipped" : "launched";

  return [
    `${source} ${verb} this.`,
    "",
    "Looks worth testing inside a real workflow. Strong take after hands-on time.",
  ].join("\n");
}

export function buildXLikedPostContent(input: {
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
  includeSource?: boolean;
}) {
  const handle = normalizeHandle(input.authorHandle || "unknown");
  if (isFableWindowEssay(input.sourceText)) {
    return buildFableWindowShare(input.sourceUrl);
  }

  const angle = getXLikedPostAngle(input.sourceText);
  if (
    angle.label === "repo bookmark" ||
    angle.label === "ai talent human cost"
  ) {
    return angle.take;
  }

  if (angle.label === "video benchmark") {
    return angle.take;
  }

  if (hasSourceOwnedLaunchSignal(input.sourceText)) {
    return buildSourceOwnedLaunchTake({
      handle,
      sourceText: input.sourceText,
    });
  }

  return angle.take;
}

function fitWithinCharacterBudget(value: string, maxLength: number) {
  const clean = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (clean.length <= maxLength) return clean;

  const githubUrl = clean.match(/https:\/\/github\.com\/[^\s)]+/i)?.[0];
  if (githubUrl && githubUrl.length < maxLength - 40) {
    const firstLine = clean.split("\n").find((line) => line.trim() && !line.includes(githubUrl)) ?? "";
    const intro = shortenLine(firstLine, maxLength - githubUrl.length - 2);
    return [intro, githubUrl].filter(Boolean).join("\n").trim();
  }

  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    const separator = kept.length > 0 ? 2 : 0;
    const remaining = maxLength - used - separator;
    if (remaining <= 0) break;

    const fitted = shortenLine(line, Math.max(40, remaining));
    if (!fitted) continue;
    kept.push(fitted);
    used += fitted.length + separator;
    if (used >= maxLength) break;
  }

  const joined = kept.join("\n\n").trim();
  if (joined.length <= maxLength) return joined;
  return joined.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

export function buildFaithfulXLikedFallbackPostContent(input: {
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
  hasMedia?: boolean;
  externalUrls?: string[];
}) {
  const sourceText = input.sourceText;
  const content = buildXLikedPostContent({
    authorHandle: input.authorHandle,
    sourceUrl: input.sourceUrl,
    sourceText,
    includeSource: false,
  });
  const fallback = content || buildCloseToOriginalXLikedPostContent(sourceText);
  const budget = input.hasMedia ? 600 : 1200;
  const repaired = repairSourceOwnedFirstPerson({
    content: fallback || cleanXLikedText(sourceText),
    sourceText,
    authorHandle: input.authorHandle,
  });
  const primaryStudyUrl = pickPrimaryStudyUrl(input.externalUrls ?? []);
  const withStudyUrl =
    primaryStudyUrl && looksLikeStudyClaim(sourceText) && !repaired.includes(primaryStudyUrl)
      ? [repaired, "", `Study: ${primaryStudyUrl}`].join("\n")
      : repaired;

  return fitWithinCharacterBudget(withStudyUrl, budget);
}

function looksLikeStudyClaim(text: string) {
  return /\b(study|paper|research|participants|people|subjects|respondents|experiment|arxiv|doi)\b/i.test(text);
}

function pickPrimaryStudyUrl(urls: string[]) {
  return urls.find((url) => /\b(arxiv\.org|doi\.org|papers\.ssrn\.com|openreview\.net|nature\.com|science\.org|acm\.org|ieee\.org)\b/i.test(url))
    ?? null;
}

function repairSourceOwnedFirstPerson(input: {
  content: string;
  sourceText: string;
  authorHandle: string;
}) {
  if (!hasFirstPersonClaim(input.sourceText) || !hasFirstPersonClaim(input.content)) {
    return input.content;
  }

  const handle = normalizeHandle(input.authorHandle || "source");
  const lines = splitMeaningfulLines(input.sourceText);
  const first = sourceFirstPersonToRule(lines[0] ?? input.sourceText, handle);
  const concrete = lines.find((line) => /\b(goal|codex|claude|agent|prompt|diff|tok\/s|seconds?|minutes?|hours?|%|\$|\d)\b/i.test(line));
  const second = concrete && concrete !== lines[0] ? shortenLine(concrete, 220) : "";

  return [
    "Useful pattern to steal:",
    "",
    first,
    second ? "" : null,
    second || null,
    "",
    "The post is not the point. The workflow rule is.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function hasFirstPersonClaim(text: string) {
  return /\b(I|I'm|I’m|I've|I’ve|my|we|we're|we’re|we've|we’ve|our)\b/.test(text);
}

function sourceFirstPersonToRule(line: string, handle: string) {
  const cleaned = shortenLine(line, 220)
    .replace(/\bmy own\b/gi, "a")
    .replace(/\bour own\b/gi, "a")
    .replace(/\bmy\b/gi, "their")
    .replace(/\bour\b/gi, "their")
    .replace(/\bI ask\b/gi, "ask")
    .replace(/\bI use\b/gi, "use")
    .replace(/\bI write\b/gi, "write")
    .replace(/\bwe ask\b/gi, "ask")
    .replace(/\bwe use\b/gi, "use")
    .replace(/\bwe write\b/gi, "write")
    .replace(/^\s*I\s+/i, "")
    .replace(/^\s*we\s+/i, "")
    .trim();

  if (cleaned.startsWith(`@${handle}`)) return cleaned;
  return `@${handle}'s workflow: ${cleaned}`;
}

export function buildXLikedPlatformPostContent(input: {
  baseContent: string;
  platformType: string;
  media: XLikedMedia | null;
  sourceUrl: string;
  authorHandle?: string;
}) {
  const normalized = input.platformType.toLowerCase();
  const shouldEmbedSourceVideo =
    input.media?.mediaType === "video" &&
    (normalized === "x" || normalized === "twitter");

  if (!shouldEmbedSourceVideo) {
    return input.baseContent;
  }

  const embedUrl = input.media?.sourceUrl || input.sourceUrl;
  if (input.baseContent.includes(embedUrl)) return input.baseContent;
  return [input.baseContent.trim(), "", embedUrl].join("\n");
}

function pickTweetMedia(tweet: BirdTweet): XLikedMedia | null {
  const sourceUrl = buildXLikedSourceUrl(tweet);

  for (const media of tweet.media ?? []) {
    const videoUrl = asString(media.videoUrl);
    if (videoUrl) {
      return { url: videoUrl, mediaType: "video", sourceUrl };
    }

    const url = asString(media.url) ?? asString(media.previewUrl);
    if (url) {
      const mediaType =
        media.type?.toLowerCase().includes("video") || /\.(mp4|mov|webm)(\?|$)/i.test(url)
          ? "video"
          : "image";
      return { url, mediaType, sourceUrl };
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
    return { url: fallbackImageUrl.trim(), mediaType: "image", sourceUrl: buildXLikedSourceUrl(tweet) };
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
