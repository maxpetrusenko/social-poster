import type { SourceEvidenceCandidate } from "./types";

export type GithubRepoEvidenceContext = {
  owner: string;
  repo: string;
  repoUrl?: string;
};

export type GithubPullRequest = {
  number: number;
  title?: string | null;
  html_url?: string | null;
  body?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  merged_at?: string | null;
  state?: string | null;
  draft?: boolean | null;
};

export type GithubRelease = {
  id?: number | string | null;
  tag_name?: string | null;
  name?: string | null;
  html_url?: string | null;
  body?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  draft?: boolean | null;
  prerelease?: boolean | null;
};

export function extractGithubRepoEvidenceCandidates(input: {
  source: GithubRepoEvidenceContext;
  pullRequests?: GithubPullRequest[];
  releases?: GithubRelease[];
}): SourceEvidenceCandidate[] {
  const candidates: SourceEvidenceCandidate[] = [];

  for (const pullRequest of input.pullRequests ?? []) {
    const candidate = normalizeGithubPullRequestEvidence(input.source, pullRequest);
    if (candidate) candidates.push(candidate);
  }

  for (const release of input.releases ?? []) {
    const candidate = normalizeGithubReleaseEvidence(input.source, release);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

export function normalizeGithubPullRequestEvidence(
  source: GithubRepoEvidenceContext,
  pullRequest: GithubPullRequest
): SourceEvidenceCandidate | null {
  const title = cleanValue(pullRequest.title);
  if (!title) return null;

  const summaryParts = [
    pullRequest.merged_at ? `merged PR #${pullRequest.number}` : `opened PR #${pullRequest.number}`,
    pullRequest.state ? `state: ${pullRequest.state}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    type: "pr",
    title,
    summary: summaryParts.join(" • "),
    url: pullRequest.html_url ?? buildGithubPullRequestUrl(source, pullRequest.number),
    externalId: `pr:${pullRequest.number}`,
    eventAt: parseDate(pullRequest.merged_at ?? pullRequest.updated_at ?? pullRequest.created_at),
    dedupeKey: `github:repo:${source.owner}/${source.repo}:pr:${pullRequest.number}`,
    metadata: {
      owner: source.owner,
      repo: source.repo,
      number: pullRequest.number,
      state: pullRequest.state ?? null,
      merged: Boolean(pullRequest.merged_at),
      draft: pullRequest.draft ?? null,
      body: cleanOptionalValue(pullRequest.body),
    },
  };
}

export function normalizeGithubReleaseEvidence(
  source: GithubRepoEvidenceContext,
  release: GithubRelease
): SourceEvidenceCandidate | null {
  const title = cleanValue(release.name) || cleanValue(release.tag_name);
  if (!title) return null;

  const releaseId = release.id ?? release.tag_name ?? title;
  return {
    type: "release",
    title,
    summary: [
      release.prerelease ? "pre-release" : "release",
      release.draft ? "draft" : null,
      release.published_at ? `published ${release.published_at}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" • "),
    url: release.html_url ?? buildGithubReleaseUrl(source, release.tag_name ?? String(releaseId)),
    externalId: `release:${String(releaseId)}`,
    eventAt: parseDate(release.published_at ?? release.created_at),
    dedupeKey: `github:repo:${source.owner}/${source.repo}:release:${String(releaseId)}`,
    metadata: {
      owner: source.owner,
      repo: source.repo,
      tagName: release.tag_name ?? null,
      releaseId: release.id ?? null,
      draft: release.draft ?? null,
      prerelease: release.prerelease ?? null,
      body: cleanOptionalValue(release.body),
    },
  };
}

function buildGithubPullRequestUrl(source: GithubRepoEvidenceContext, number: number) {
  return `${source.repoUrl ?? `https://github.com/${source.owner}/${source.repo}`}/pull/${number}`;
}

function buildGithubReleaseUrl(source: GithubRepoEvidenceContext, tagName: string) {
  return `${source.repoUrl ?? `https://github.com/${source.owner}/${source.repo}`}/releases/tag/${encodeURIComponent(tagName)}`;
}

function cleanValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanOptionalValue(value: string | null | undefined) {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

