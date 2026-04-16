import type { FixedScheduleContent } from "./fixed-schedule-post";
import { getAppUrlFromEnv } from "@/lib/app-url";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "social-poster-agent-persona-updates",
};

type GithubOrgEvent = {
  id?: string;
  type?: string;
  created_at?: string;
  repo?: {
    name?: string;
  };
  payload?: {
    action?: string;
    ref?: string | null;
    pull_request?: {
      title?: string;
      html_url?: string;
      merged_at?: string | null;
    };
    issue?: {
      title?: string;
      html_url?: string;
      pull_request?: unknown;
    };
  };
};

type GithubRepo = {
  name?: string;
  html_url?: string;
  description?: string | null;
  updated_at?: string;
  stargazers_count?: number;
};

type AgentPersonaPostConfig = {
  postMode?: unknown;
  lookbackHours?: unknown;
  title?: unknown;
  summary?: unknown;
  mediaUrl?: unknown;
  mediaUrlByPlatform?: unknown;
  siteUrl?: unknown;
  githubOrg?: unknown;
  repoName?: unknown;
  ctaUrl?: unknown;
  transformationPrompt?: unknown;
};

type AgentPersonaSnapshot = {
  title: string;
  description: string;
  blogTitles: string[];
  activities: SummarizedActivity[];
  repoName: string;
  repoUrl: string;
  repoStars: number | null;
  ctaUrl: string;
};

export type AgentPersonaScheduleContext = {
  titleOverride: string | null;
  summaryOverride: string | null;
  lookbackHours: number;
  siteUrl: string;
  githubOrg: string;
  repoName: string;
  ctaUrl: string;
  mediaSource: Record<string, unknown> | null;
  mediaUrl: string | null;
  siteSnapshot: ReturnType<typeof parseSiteSnapshot>;
  orgEvents: GithubOrgEvent[];
  repo: GithubRepo | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePlatform(platform: string) {
  return platform === "x" ? "twitter" : platform.toLowerCase();
}

function resolveAssetUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("/")) return value;

  try {
    return new URL(value, getAppUrlFromEnv()).toString();
  } catch {
    return value;
  }
}

function clampLookbackHours(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return 24;
  return Math.min(72, Math.max(6, parsed));
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatRepoName(value: string) {
  const repo = value.split("/").pop() || value;
  return repo.replace(/[-_]/g, " ");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function parseBannedPhrases(prompt: string | null): string[] {
  if (!prompt) return [];
  const line = prompt
    .toLowerCase()
    .split("\n")
    .find((l) => l.trim().startsWith("ban_phrases:"));
  if (!line) return [];
  return line
    .replace("ban_phrases:", "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: GITHUB_HEADERS,
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractMeta(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractBlogTitles(html: string) {
  const matches = html.matchAll(/<h3><a href="\.\/blog\/[^"]+">([^<]+)<\/a><\/h3>/g);
  return uniq(
    Array.from(matches)
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value))
  ).slice(0, 3);
}

function parseSiteSnapshot(html: string) {
  const title =
    extractMeta(html, "og:title") ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "Persona6";
  const description =
    extractMeta(html, "description") ||
    extractMeta(html, "og:description") ||
    "Grounded AI personas for live products.";

  return {
    title,
    description,
    blogTitles: extractBlogTitles(html),
  };
}

function withinLookback(
  createdAt: string | undefined,
  runAt: Date,
  lookbackHours: number
) {
  if (!createdAt) return false;
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return false;
  return runAt.getTime() - createdTime <= lookbackHours * 60 * 60 * 1000;
}

type DescribedEvent = {
  priority: number;
  text: string;
  url: string | null;
};

function describeEvent(event: GithubOrgEvent): DescribedEvent | null {
  const repoName = formatRepoName(event.repo?.name || "repo");
  const repoFullName = event.repo?.name || "repo";
  const payload = event.payload || {};

  if (event.type === "PullRequestEvent") {
    const pr = payload.pull_request;
    const title = pickString(pr?.title);
    if (payload.action === "opened" && title) {
      return {
        priority: 4,
        text: `opened PR in ${repoName}: ${title}`,
        url: pickString(pr?.html_url),
      };
    }
    if (payload.action === "closed" && pr?.merged_at && title) {
      return {
        priority: 4,
        text: `merged PR in ${repoName}: ${title}`,
        url: pickString(pr?.html_url),
      };
    }
  }

  if (event.type === "IssuesEvent") {
    const issue = payload.issue;
    const title = pickString(issue?.title);
    if (!issue?.pull_request && payload.action === "closed" && title) {
      return {
        priority: 3,
        text: `closed issue in ${repoName}: ${title}`,
        url: pickString(issue?.html_url),
      };
    }
  }

  if (event.type === "CreateEvent" && payload.ref && payload.action !== "deleted") {
    return {
      priority: 2,
      text: `cut branch in ${repoName}: ${String(payload.ref)}`,
      url: `https://github.com/${repoFullName}/tree/${String(payload.ref)}`,
    };
  }

  if (event.type === "WatchEvent") {
    return {
      priority: 1,
      text: `new stargazers on ${repoName}`,
      url: `https://github.com/${repoFullName}/stargazers`,
    };
  }

  return null;
}

type SummarizedActivity = {
  text: string;
  url: string | null;
  eventId: string | null;
};

function summarizeEvents(
  events: GithubOrgEvent[],
  runAt: Date,
  lookbackHours: number,
  usedEventIds: Set<string> = new Set()
): SummarizedActivity[] {
  const items = events
    .filter((event) => {
      if (!withinLookback(event.created_at, runAt, lookbackHours)) return false;
      if (event.id && usedEventIds.has(`gh-event:${event.id}`)) return false;
      return true;
    })
    .map((event) => {
      const described = describeEvent(event);
      if (!described) return null;

      return {
        createdAt: new Date(event.created_at || 0).getTime(),
        eventId: event.id || null,
        ...described,
      };
    })
    .filter(
      (
        value
      ): value is {
        createdAt: number;
        priority: number;
        text: string;
        url: string | null;
        eventId: string | null;
      } => Boolean(value)
    )
    .sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt);

  // Deduplicate by text within a single run
  const seen = new Set<string>();
  const result: SummarizedActivity[] = [];
  for (const item of items) {
    if (seen.has(item.text)) continue;
    seen.add(item.text);
    result.push({ text: item.text, url: item.url, eventId: item.eventId });
    if (result.length >= 3) break;
  }

  return result;
}

function buildTwitterCopy(snapshot: AgentPersonaSnapshot, runAt: Date) {
  const dayLabel = runAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const lines = [`Agent Persona ${dayLabel}:`];

  const firstActivity = snapshot.activities[0];
  if (firstActivity) {
    const activityText = truncate(firstActivity.text, 120);
    lines.push(firstActivity.url ? `${activityText}\n${firstActivity.url}` : activityText);
  }

  if (snapshot.blogTitles[0]) {
    lines.push(`Site: ${truncate(snapshot.blogTitles[0], 72)}`);
  }

  if (snapshot.repoStars && snapshot.repoStars > 0) {
    lines.push(`${snapshot.repoStars} stars on ${formatRepoName(snapshot.repoName)}`);
  }

  lines.push(snapshot.ctaUrl);

  return truncate(lines.join("\n"), 280);
}

function buildLinkedInCopy(snapshot: AgentPersonaSnapshot, runAt: Date) {
  const dayLabel = runAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const lines = [`What we shipped on Agent Persona for ${dayLabel}:`, ""];

  for (const activity of snapshot.activities) {
    const label = titleCaseWords(activity.text);
    lines.push(activity.url ? `• ${label} — ${activity.url}` : `• ${label}`);
  }

  if (snapshot.blogTitles.length > 0) {
    lines.push("");
    lines.push(`Live site themes: ${snapshot.blogTitles.join(" · ")}`);
  }

  lines.push("");
  lines.push(snapshot.description);
  lines.push(`${snapshot.ctaUrl} | ${snapshot.repoUrl}`);

  return truncate(lines.join("\n"), 3000);
}

export async function resolveAgentPersonaScheduleContent(
  config: unknown,
  platformTypes: string[],
  runAt: Date = new Date()
): Promise<FixedScheduleContent | null> {
  if (!isObject(config)) return null;

  const typedConfig = config as AgentPersonaPostConfig;
  if (typedConfig.postMode !== "agent_persona_updates") return null;

  const context = await loadAgentPersonaScheduleContext(config);
  if (!context) return null;

  // Parse ban_phrases from transformationPrompt if present
  const bannedPhrases = parseBannedPhrases(
    pickString(typedConfig.transformationPrompt)
  );

  return renderAgentPersonaScheduleContent(context, platformTypes, runAt, {
    bannedPhrases,
  });
}

export async function loadAgentPersonaScheduleContext(
  config: unknown
): Promise<AgentPersonaScheduleContext | null> {
  if (!isObject(config)) return null;

  const typedConfig = config as AgentPersonaPostConfig;
  if (typedConfig.postMode !== "agent_persona_updates") return null;

  const lookbackHours = clampLookbackHours(typedConfig.lookbackHours);
  const siteUrl = pickString(typedConfig.siteUrl) || "https://agent-persona.org/";
  const githubOrg = pickString(typedConfig.githubOrg) || "agent-persona";
  const repoName = pickString(typedConfig.repoName) || "personas-pipeline";
  const ctaUrl = pickString(typedConfig.ctaUrl) || siteUrl;
  const mediaSource = isObject(typedConfig.mediaUrlByPlatform)
    ? typedConfig.mediaUrlByPlatform
    : null;
  const siteHtmlPromise = fetchText(siteUrl);
  const orgEventsPromise = fetchJson<GithubOrgEvent[]>(
    `${GITHUB_API_BASE}/orgs/${githubOrg}/events?per_page=30`
  );
  const repoPromise = fetchJson<GithubRepo>(
    `${GITHUB_API_BASE}/repos/${githubOrg}/${repoName}`
  );

  const [siteHtml, orgEvents, repo] = await Promise.all([
    siteHtmlPromise,
    orgEventsPromise,
    repoPromise,
  ]);

  return {
    titleOverride: pickString(typedConfig.title),
    summaryOverride: pickString(typedConfig.summary),
    lookbackHours,
    siteUrl,
    githubOrg,
    repoName,
    ctaUrl,
    mediaSource,
    mediaUrl: pickString(typedConfig.mediaUrl),
    siteSnapshot: parseSiteSnapshot(siteHtml || ""),
    orgEvents: orgEvents || [],
    repo,
  };
}

async function loadUsedEventIds(): Promise<Set<string>> {
  try {
    const { db } = await import("@/db");
    const { dedupCache } = await import("@/db/schema");
    const { like } = await import("drizzle-orm");
    const rows = await db
      .select({ key: dedupCache.key })
      .from(dedupCache)
      .where(like(dedupCache.key, "gh-event:%"));
    return new Set(rows.map((r) => r.key));
  } catch {
    return new Set();
  }
}

export async function renderAgentPersonaScheduleContent(
  context: AgentPersonaScheduleContext,
  platformTypes: string[],
  runAt: Date = new Date(),
  options: { bannedPhrases?: string[]; usedEventIds?: Set<string> } = {}
): Promise<FixedScheduleContent> {
  // Load already-posted event IDs from dedup_cache (skip if provided for testing)
  const usedEventIds = options.usedEventIds ?? (await loadUsedEventIds());

  const activities = summarizeEvents(
    context.orgEvents,
    runAt,
    context.lookbackHours,
    usedEventIds
  );

  const repoUrl =
    pickString(context.repo?.html_url) ||
    `https://github.com/${context.githubOrg}/${context.repoName}`;

  // Rotate fallback by day-of-year so consecutive runs vary
  const dayOfYear = Math.floor(
    (runAt.getTime() - new Date(runAt.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const siteName = context.siteSnapshot.title.replace(/\s+\|\s+.*/, "");
  const fallbackPool: SummarizedActivity[] = [
    { text: `updated the public site for ${siteName}`, url: context.siteUrl.replace(/\/$/, ""), eventId: null },
    { text: `continued shipping inside ${formatRepoName(context.repoName)}`, url: repoUrl, eventId: null },
    { text: `published product updates at ${context.siteUrl.replace(/\/$/, "")}`, url: context.siteUrl.replace(/\/$/, ""), eventId: null },
    { text: `pushed new commits to ${formatRepoName(context.repoName)}`, url: repoUrl, eventId: null },
    { text: `iterated on ${siteName} — see latest changes`, url: context.siteUrl.replace(/\/$/, ""), eventId: null },
    { text: `refined ${formatRepoName(context.repoName)} across multiple branches`, url: repoUrl, eventId: null },
  ];
  const fallbackStart = dayOfYear % fallbackPool.length;
  const fallbackActivities = [
    fallbackPool[fallbackStart],
    fallbackPool[(fallbackStart + 1) % fallbackPool.length],
    fallbackPool[(fallbackStart + 2) % fallbackPool.length],
  ];

  const resolvedActivities = activities.length > 0 ? activities : fallbackActivities;

  const snapshot: AgentPersonaSnapshot = {
    title:
      context.titleOverride ||
      `${siteName} build log`,
    description:
      context.summaryOverride || context.siteSnapshot.description,
    blogTitles: context.siteSnapshot.blogTitles,
    activities: resolvedActivities,
    repoName: context.repoName,
    repoUrl,
    repoStars:
      typeof context.repo?.stargazers_count === "number"
        ? context.repo.stargazers_count
        : null,
    ctaUrl: context.ctaUrl,
  };

  const resolvedContentByPlatform: Record<string, string> = {};
  const resolvedMediaUrlByPlatform: Record<string, string | null> = {};

  for (const platformType of platformTypes) {
    const normalizedPlatform = normalizePlatform(platformType);
    let content =
      normalizedPlatform === "linkedin"
        ? buildLinkedInCopy(snapshot, runAt)
        : buildTwitterCopy(snapshot, runAt);

    // Apply ban_phrases filter
    for (const phrase of options.bannedPhrases || []) {
      if (!phrase) continue;
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      content = content.replace(new RegExp(escaped, "ig"), "");
    }
    // Clean up double spaces left by removals
    content = content.replace(/ {2,}/g, " ").trim();

    resolvedContentByPlatform[normalizedPlatform] = content;

    const platformMediaUrl =
      context.mediaSource && isObject(context.mediaSource)
        ? pickString(context.mediaSource[normalizedPlatform]) ||
          pickString(context.mediaSource[platformType])
        : null;

    resolvedMediaUrlByPlatform[normalizedPlatform] = resolveAssetUrl(
      platformMediaUrl || context.mediaUrl
    );
  }

  // Collect dedup keys for events used in this post
  const dedupKeys = resolvedActivities
    .map((a) => a.eventId)
    .filter((id): id is string => Boolean(id))
    .map((id) => `gh-event:${id}`);

  return {
    title: snapshot.title,
    summary: snapshot.description,
    variantIndex: 0,
    contentByPlatform: resolvedContentByPlatform,
    mediaUrlByPlatform: resolvedMediaUrlByPlatform,
    instagramContentTypeByPlatform: {},
    dedupKeys,
  };
}
