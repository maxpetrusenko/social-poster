import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "@/db";
import { sourceEvidence, sourceFeeds } from "@/db/schema";

import {
  materializeSourceEvidenceRecord,
} from "./evidence-store";
import type {
  SourceEvidenceCandidate,
  SourceEvidenceRecord,
  SourceEvidenceStatus,
} from "./types";
import { normalizeSourceEvidenceStatus } from "./types";

type SourceEvidenceRow = typeof sourceEvidence.$inferSelect;
type SourceEvidenceDbLike = {
  query: Db["query"];
  select: Db["select"];
  insert: Db["insert"];
  update: Db["update"];
};

export type SourceEvidenceUpsertInput = {
  workspaceId: string;
  sourceFeedId?: string | null;
  candidate: SourceEvidenceCandidate;
  status?: SourceEvidenceStatus;
  metadata?: Record<string, unknown> | null;
  now?: Date;
};

export type SourceEvidenceListInput = {
  workspaceId: string;
  sourceFeedId?: string | null;
  statuses?: SourceEvidenceStatus[];
  limit?: number;
};

export type SourceEvidenceStatusUpdateInput = {
  workspaceId: string;
  evidenceId: string;
  status: SourceEvidenceStatus;
  now?: Date;
};

export type SourceEvidenceStore = ReturnType<typeof createSourceEvidenceStore>;

export function createSourceEvidenceStore(database: Db) {
  return {
    async upsertEvidence(input: SourceEvidenceUpsertInput) {
      const now = input.now ?? new Date();
      const sourceFeedId = input.sourceFeedId ?? null;

      if (sourceFeedId) {
        await assertSourceFeedBelongsToWorkspace(database, input.workspaceId, sourceFeedId);
      }

      const record = materializeSourceEvidenceRecord({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        sourceFeedId,
        candidate: input.candidate,
        status: normalizeSourceEvidenceStatus(input.status),
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      });

      if (!record.dedupeKey.trim()) {
        throw new Error("Source evidence dedupe key is required");
      }

      const existing = await findMatchingEvidence(database, {
        workspaceId: input.workspaceId,
        sourceFeedId,
        dedupeKey: record.dedupeKey,
        externalId: record.externalId,
      });

      if (existing) {
        const merged = mergeEvidenceRecords(existing, record, now);
        await database
          .update(sourceEvidence)
          .set({
            sourceFeedId: merged.sourceFeedId,
            type: merged.type,
            title: merged.title,
            summary: merged.summary,
            url: merged.url,
            externalId: merged.externalId,
            eventAt: merged.eventAt,
            dedupeKey: merged.dedupeKey,
            status: merged.status,
            metadata: merged.metadata,
            updatedAt: merged.updatedAt,
          })
          .where(eq(sourceEvidence.id, existing.id));

        return merged;
      }

      try {
        await database.insert(sourceEvidence).values(record);
        return record;
      } catch (error) {
        if (isUniqueConflictError(error)) {
          const conflict = await findMatchingEvidence(database, {
            workspaceId: input.workspaceId,
            sourceFeedId,
            dedupeKey: record.dedupeKey,
            externalId: record.externalId,
          });
          if (conflict) {
            const merged = mergeEvidenceRecords(conflict, record, now);
            await database
              .update(sourceEvidence)
              .set({
                sourceFeedId: merged.sourceFeedId,
                type: merged.type,
                title: merged.title,
                summary: merged.summary,
                url: merged.url,
                externalId: merged.externalId,
                eventAt: merged.eventAt,
                dedupeKey: merged.dedupeKey,
                status: merged.status,
                metadata: merged.metadata,
                updatedAt: merged.updatedAt,
              })
              .where(eq(sourceEvidence.id, conflict.id));
            return merged;
          }
        }

        throw error;
      }
    },

    async listEvidence(input: SourceEvidenceListInput): Promise<SourceEvidenceRecord[]> {
      const limit = clampLimit(input.limit ?? 50);
      const where = buildListWhere(input);

      const rows = await database
        .select()
        .from(sourceEvidence)
        .where(where)
        .orderBy(
          desc(sourceEvidence.eventAt),
          desc(sourceEvidence.updatedAt),
          desc(sourceEvidence.createdAt)
        )
        .limit(limit);

      return rows.map(toSourceEvidenceRecord);
    },

    async markEvidenceStatus(input: SourceEvidenceStatusUpdateInput): Promise<SourceEvidenceRecord> {
      const now = input.now ?? new Date();
      const [existing] = await database
        .select()
        .from(sourceEvidence)
        .where(
          and(
            eq(sourceEvidence.id, input.evidenceId),
            eq(sourceEvidence.workspaceId, input.workspaceId)
          )
        )
        .limit(1);

      if (!existing) {
        throw new Error("Source evidence not found");
      }

      const status = normalizeSourceEvidenceStatus(input.status, normalizeSourceEvidenceStatus(existing.status));

      await database
        .update(sourceEvidence)
        .set({
          status,
          updatedAt: now,
        })
        .where(
          and(
            eq(sourceEvidence.id, input.evidenceId),
            eq(sourceEvidence.workspaceId, input.workspaceId)
          )
        );

      return {
        ...toSourceEvidenceRecord(existing),
        status,
        updatedAt: now,
      };
    },
  };
}

function clampLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}

function buildListWhere(input: SourceEvidenceListInput) {
  const clauses = [eq(sourceEvidence.workspaceId, input.workspaceId)];

  if (typeof input.sourceFeedId === "string" && input.sourceFeedId) {
    clauses.push(eq(sourceEvidence.sourceFeedId, input.sourceFeedId));
  }

  if (input.statuses?.length) {
    clauses.push(
      input.statuses.length === 1
        ? eq(sourceEvidence.status, input.statuses[0])
        : inArray(sourceEvidence.status, input.statuses)
    );
  }

  return and(...clauses);
}

function mergeEvidenceRecords(
  existing: SourceEvidenceRow,
  incoming: SourceEvidenceRecord,
  now: Date
): SourceEvidenceRecord {
  const metadata = mergeMetadata(existing.metadata, incoming.metadata);
  const currentStatus = normalizeSourceEvidenceStatus(existing.status);
  const status = currentStatus === "new" ? incoming.status : currentStatus;

  return {
    id: existing.id,
    workspaceId: existing.workspaceId,
    sourceFeedId: existing.sourceFeedId ?? incoming.sourceFeedId,
    type: incoming.type,
    title: incoming.title,
    summary: incoming.summary,
    url: incoming.url,
    externalId: incoming.externalId,
    eventAt: incoming.eventAt,
    dedupeKey: incoming.dedupeKey,
    status,
    metadata,
    createdAt: existing.createdAt ?? incoming.createdAt,
    updatedAt: now,
  };
}

function mergeMetadata(
  existing: SourceEvidenceRow["metadata"],
  incoming: SourceEvidenceRecord["metadata"]
): Record<string, unknown> | null {
  if (!existing && !incoming) return null;
  if (!existing) return incoming;
  if (!incoming) return existing;

  return {
    ...(existing ?? {}),
    ...(incoming ?? {}),
  };
}

function toSourceEvidenceRecord(row: SourceEvidenceRow): SourceEvidenceRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceFeedId: row.sourceFeedId,
    type: row.type as SourceEvidenceRecord["type"],
    title: row.title,
    summary: row.summary,
    url: row.url,
    externalId: row.externalId,
    eventAt: row.eventAt,
    dedupeKey: row.dedupeKey,
    status: normalizeSourceEvidenceStatus(row.status),
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findMatchingEvidence(
  database: SourceEvidenceDbLike,
  input: {
    workspaceId: string;
    sourceFeedId: string | null;
    dedupeKey: string;
    externalId: string | null;
  }
) {
  const dedupeMatch = await database.query.sourceEvidence.findFirst({
    where: and(
      eq(sourceEvidence.workspaceId, input.workspaceId),
      eq(sourceEvidence.dedupeKey, input.dedupeKey)
    ),
  });
  if (dedupeMatch) return dedupeMatch;

  if (!input.sourceFeedId || !input.externalId) return null;

  return database.query.sourceEvidence.findFirst({
    where: and(
      eq(sourceEvidence.workspaceId, input.workspaceId),
      eq(sourceEvidence.sourceFeedId, input.sourceFeedId),
      eq(sourceEvidence.externalId, input.externalId)
    ),
  });
}

async function assertSourceFeedBelongsToWorkspace(
  database: SourceEvidenceDbLike,
  workspaceId: string,
  sourceFeedId: string
) {
  const feed = await database.query.sourceFeeds.findFirst({
    where: and(
      eq(sourceFeeds.id, sourceFeedId),
      eq(sourceFeeds.workspaceId, workspaceId)
    ),
  });

  if (!feed) {
    throw new Error("Source feed not found in workspace");
  }
}

function isUniqueConflictError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_CONSTRAINT");
}
