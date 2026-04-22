export const SOURCE_FEED_TYPES = [
  "github_repo",
  "github_org",
  "rss",
  "url",
  "manual_note",
  "local_repo",
] as const;

export type SourceFeedType = (typeof SOURCE_FEED_TYPES)[number];

export const SOURCE_EVIDENCE_TYPES = [
  "commit",
  "pr",
  "release",
  "issue",
  "docs_change",
  "rss_item",
  "url",
  "note",
] as const;

export type SourceEvidenceType = (typeof SOURCE_EVIDENCE_TYPES)[number];

export const SOURCE_EVIDENCE_STATUSES = [
  "new",
  "drafted",
  "rejected",
  "used",
  "stale",
] as const;

export type SourceEvidenceStatus = (typeof SOURCE_EVIDENCE_STATUSES)[number];

export type SourceEvidenceCandidate = {
  type: SourceEvidenceType;
  title: string;
  summary: string;
  url?: string;
  externalId?: string;
  eventAt?: Date;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
};

export type SourceEvidenceSnapshot = {
  sourceUrl: string;
  title: string;
  summary: string;
  imageUrl: string | null;
};

export type SourceFeedRecord = {
  id: string;
  workspaceId: string;
  type: SourceFeedType;
  name: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceEvidenceRecord = {
  id: string;
  workspaceId: string;
  sourceFeedId: string | null;
  type: SourceEvidenceType;
  title: string;
  summary: string;
  url: string | null;
  externalId: string | null;
  eventAt: Date | null;
  dedupeKey: string;
  status: SourceEvidenceStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export function isSourceFeedType(value: unknown): value is SourceFeedType {
  return typeof value === "string" && (SOURCE_FEED_TYPES as readonly string[]).includes(value);
}

export function isSourceEvidenceType(value: unknown): value is SourceEvidenceType {
  return typeof value === "string" && (SOURCE_EVIDENCE_TYPES as readonly string[]).includes(value);
}

export function isSourceEvidenceStatus(value: unknown): value is SourceEvidenceStatus {
  return typeof value === "string" && (SOURCE_EVIDENCE_STATUSES as readonly string[]).includes(value);
}

export function normalizeSourceEvidenceStatus(
  value: unknown,
  fallback: SourceEvidenceStatus = "new"
): SourceEvidenceStatus {
  return isSourceEvidenceStatus(value) ? value : fallback;
}
