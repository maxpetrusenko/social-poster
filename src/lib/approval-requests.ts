import "server-only";

import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { approvalRequests } from "@/db/schema";
import {
  normalizeApprovalDecision,
  isApprovalRequestResolved,
  mapApprovalRequestRow,
  type ApprovalDecision,
  type ApprovalRequestRow,
  type ApprovalRequestViewRow,
} from "@/lib/approvals";

type ApprovalRequestInsertInput = {
  workspaceId: string;
  postId: string;
  requestedByUserId: string | null;
  policySnapshot?: Record<string, unknown>;
};

type ApprovalDecisionInput = {
  workspaceId: string;
  postId: string;
  decision: string;
  decidedByUserId: string;
};

export async function getLatestApprovalRequestForPost(input: {
  workspaceId: string;
  postId: string;
}): Promise<ApprovalRequestViewRow | null> {
  const [row] = await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.workspaceId, input.workspaceId), eq(approvalRequests.postId, input.postId)))
    .orderBy(desc(approvalRequests.updatedAt), desc(approvalRequests.createdAt))
    .limit(1);

  return row ? mapApprovalRequestRow(row as ApprovalRequestRow) : null;
}

export async function requestApprovalForPost(input: ApprovalRequestInsertInput) {
  const now = new Date();
  const latest = (await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.workspaceId, input.workspaceId), eq(approvalRequests.postId, input.postId)))
    .orderBy(desc(approvalRequests.updatedAt), desc(approvalRequests.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null)) as ApprovalRequestRow | null;

  const values = {
    requestedByUserId: input.requestedByUserId,
    policySnapshot: input.policySnapshot ?? null,
    openedAt: null,
    resolvedAt: null,
    updatedAt: now,
  } as const;

  if (latest && !isApprovalRequestResolved(latest.status)) {
    const [updated] = await db
      .update(approvalRequests)
      .set({
        ...values,
        status: "requested",
      })
      .where(eq(approvalRequests.id, latest.id))
      .returning();

    return {
      approvalRequest: mapApprovalRequestRow(updated as ApprovalRequestRow),
      created: false,
    };
  }

  const [created] = await db
    .insert(approvalRequests)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      postId: input.postId,
      postVariantId: null,
      status: "requested",
      requestedByUserId: input.requestedByUserId,
      requestedForRole: null,
      requestedForEmail: null,
      dueAt: null,
      openedAt: null,
      resolvedAt: null,
      currentRevisionId: null,
      policySnapshot: input.policySnapshot ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    approvalRequest: mapApprovalRequestRow(created as ApprovalRequestRow),
    created: true,
  };
}

export async function resolveApprovalRequestForPost(
  input: ApprovalDecisionInput
) {
  const decision = normalizeApprovalDecision(input.decision);
  if (!decision) {
    return {
      approvalRequest: null,
      updated: false,
      reason: "Invalid approval decision.",
    } as const;
  }

  const now = new Date();
  const latest = (await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.workspaceId, input.workspaceId), eq(approvalRequests.postId, input.postId)))
    .orderBy(desc(approvalRequests.updatedAt), desc(approvalRequests.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null)) as ApprovalRequestRow | null;

  if (!latest) {
    return {
      approvalRequest: null,
      updated: false,
      reason: "No approval request exists for this post.",
    } as const;
  }

  if (isApprovalRequestResolved(latest.status)) {
    return {
      approvalRequest: mapApprovalRequestRow(latest),
      updated: false,
      reason: "The latest approval request is already resolved.",
    } as const;
  }

  const nextStatus: ApprovalDecision | "changes_requested" = decision;
  const [updated] = await db
    .update(approvalRequests)
    .set({
      status: nextStatus,
      resolvedAt: decision === "changes_requested" ? null : now,
      updatedAt: now,
    })
    .where(eq(approvalRequests.id, latest.id))
    .returning();

  return {
    approvalRequest: mapApprovalRequestRow(updated as ApprovalRequestRow),
    updated: true,
    reason: null,
  } as const;
}
