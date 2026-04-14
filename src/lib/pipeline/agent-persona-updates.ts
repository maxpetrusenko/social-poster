import type { FixedScheduleContent } from "./fixed-schedule-post";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "social-poster-agent-persona-updates",
};

type GithubOrgEvent = {
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
};

type AgentPersonaSnapshot = {
  title: string;
  description: string;
  blogTitles: string[];
  activityLines: string[];
  repoName: string;
  repoUrl: string;
  repoStars: number | null;
  ctaUrl: string;
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

  const base = process.env.APP_URL?.trim() || "http://localhost:3000";

  try {
    return new URL(value, base).toString();
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

function describeEvent(event: GithubOrgEvent) {
  const repoName = formatRepoName(event.repo?.name || "repo");
  const payload = event.payload || {};

  if (event.type === "PullRequestEvent") {
    const pr = payload.pull_request;
    const title = pickString(pr?.title);
    if (payload.action === "opened" && title) {
      return {
        priority: 4,
        text: `opened PR in ${repoName}: ${title}`,
      };
    }
    if (payload.action === "closed" && pr?.merged_at && title) {
      return {
        priority: 4,
        text: `merged PR in ${repoName}: ${title}`,
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
      };
    }
  }

  if (event.type === "CreateEvent" && payload.ref && payload.action !== "deleted") {
    return {
      priority: 2,
      text: `cut branch in ${repoName}: ${String(payload.ref)}`,
    };
  }

  if (event.type === "WatchEvent") {
    return {
      priority: 1,
      text: `picked up new repo watchers on ${repoName}`,
    };
  }

  return null;
}

function summarizeEvents(
  events: GithubOrgEvent[],
  runAt: Date,
  lookbackHours: number
) {
  const lines = events
    .filter((event) => withinLookback(event.created_at, runAt, lookbackHours))
    .map((event) => {
      const described = describeEvent(event);
      if (!described) return null;

      return {
        createdAt: new Date(event.created_at || 0).getTime(),
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
      } => Boolean(value)
    )
    .sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt)
    .map((event) => event.text);

  return uniq(lines).slice(0, 3);
}

function buildTwitterCopy(snapshot: AgentPersonaSnapshot, runAt: Date) {
  const dayLabel = runAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const lines = [`Agent Persona ${dayLabel}:`];

  if (snapshot.activityLines[0]) {
    lines.push(`Shipped: ${truncate(snapshot.activityLines[0], 140)}`);
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

  for (const activity of snapshot.activityLines) {
    lines.push(`• ${titleCaseWords(activity)}`);
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

  const siteSnapshot = parseSiteSnapshot(siteHtml || "");
  const activityLines = summarizeEvents(orgEvents || [], runAt, lookbackHours);
  const fallbackActivity = [
    `refined the public site around ${siteSnapshot.title.replace(/\s+\|\s+.*/, "")}`,
    `kept shipping inside ${formatRepoName(repoName)}`,
    `shared the latest product thesis at ${siteUrl.replace(/\/$/, "")}`,
  ];

  const snapshot: AgentPersonaSnapshot = {
    title:
      pickString(typedConfig.title) ||
      `${siteSnapshot.title.replace(/\s+\|\s+.*/, "")} build log`,
    description:
      pickString(typedConfig.summary) || siteSnapshot.description,
    blogTitles: siteSnapshot.blogTitles,
    activityLines: activityLines.length > 0 ? activityLines : fallbackActivity,
    repoName,
    repoUrl:
      pickString(repo?.html_url) || `https://github.com/${githubOrg}/${repoName}`,
    repoStars:
      typeof repo?.stargazers_count === "number" ? repo.stargazers_count : null,
    ctaUrl,
  };

  const resolvedContentByPlatform: Record<string, string> = {};
  const resolvedMediaUrlByPlatform: Record<string, string | null> = {};

  for (const platformType of platformTypes) {
    const normalizedPlatform = normalizePlatform(platformType);
    resolvedContentByPlatform[normalizedPlatform] =
      normalizedPlatform === "linkedin"
        ? buildLinkedInCopy(snapshot, runAt)
        : buildTwitterCopy(snapshot, runAt);

    const platformMediaUrl =
      mediaSource && isObject(mediaSource)
        ? pickString(mediaSource[normalizedPlatform]) || pickString(mediaSource[platformType])
        : null;

    resolvedMediaUrlByPlatform[normalizedPlatform] = resolveAssetUrl(
      platformMediaUrl || pickString(typedConfig.mediaUrl)
    );
  }

  return {
    title: snapshot.title,
    summary: snapshot.description,
    variantIndex: 0,
    contentByPlatform: resolvedContentByPlatform,
    mediaUrlByPlatform: resolvedMediaUrlByPlatform,
    instagramContentTypeByPlatform: {},
  };
}
