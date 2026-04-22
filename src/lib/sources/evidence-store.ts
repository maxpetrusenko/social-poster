import type {
  SourceEvidenceCandidate,
  SourceEvidenceRecord,
  SourceEvidenceStatus,
  SourceFeedRecord,
  SourceFeedType,
} from "./types";
import {
  isSourceEvidenceStatus,
  isSourceFeedType,
  normalizeSourceEvidenceStatus,
} from "./types";

export type SourceFeedInput = {
  id: string;
  workspaceId: string;
  type: SourceFeedType;
  name: string;
  config?: Record<string, unknown> | null;
  enabled?: boolean;
  lastCheckedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceEvidenceInput = {
  id: string;
  workspaceId: string;
  sourceFeedId?: string | null;
  candidate: SourceEvidenceCandidate;
  status?: SourceEvidenceStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeSourceFeedInput(input: SourceFeedInput): SourceFeedRecord {
  if (!isSourceFeedType(input.type)) {
    throw new Error(`Unsupported source feed type: ${String(input.type)}`);
  }

  return {
    id: input.id,
    workspaceId: input.workspaceId,
    type: input.type,
    name: input.name.trim(),
    config: input.config ?? null,
    enabled: input.enabled ?? true,
    lastCheckedAt: input.lastCheckedAt ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function materializeSourceEvidenceRecord(input: SourceEvidenceInput): SourceEvidenceRecord {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    sourceFeedId: input.sourceFeedId ?? null,
    type: input.candidate.type,
    title: input.candidate.title.trim(),
    summary: input.candidate.summary.trim(),
    url: input.candidate.url ?? null,
    externalId: input.candidate.externalId ?? null,
    eventAt: input.candidate.eventAt ?? null,
    dedupeKey: input.candidate.dedupeKey.trim(),
    status: normalizeSourceEvidenceStatus(input.status),
    metadata: input.metadata ?? input.candidate.metadata ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function rejectSourceEvidenceRecord(
  record: SourceEvidenceRecord,
  updatedAt: Date
): SourceEvidenceRecord {
  if (!isSourceEvidenceStatus(record.status)) {
    throw new Error(`Invalid source evidence status: ${String(record.status)}`);
  }

  return {
    ...record,
    status: "rejected",
    updatedAt,
  };
}

