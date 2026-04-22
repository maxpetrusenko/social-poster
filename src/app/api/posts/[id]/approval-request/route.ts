import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { posts } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import {
  getLatestApprovalRequestForPost,
  resolveApprovalRequestForPost,
  requestApprovalForPost,
} from "@/lib/approval-requests";
import {
  humanizeApprovalDecision,
  normalizeApprovalDecision,
  normalizeApprovalWorkflowMode,
} from "@/lib/approvals";

const approvalRequestBodySchema = z.object({
  decision: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const { id: postId } = await params;
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.workspaceId, tenant.currentWorkspace.id)),
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const latestApprovalRequest = await getLatestApprovalRequestForPost({
    workspaceId: tenant.currentWorkspace.id,
    postId,
  });

  return NextResponse.json({
    approvalRequest: latestApprovalRequest,
    approvalState: latestApprovalRequest?.approvalState ?? "none",
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const { id: postId } = await params;
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.workspaceId, tenant.currentWorkspace.id)),
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const approvalWorkflowMode = normalizeApprovalWorkflowMode(
    tenant.currentWorkspace.approvalWorkflowMode
  );
  if (approvalWorkflowMode === "none") {
    return NextResponse.json(
      { error: "Approval workflow is disabled for this workspace." },
      { status: 409 }
    );
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  }
  const decision = normalizeApprovalDecision(bodyResult.body?.decision);

  const result = decision
    ? await resolveApprovalRequestForPost({
        workspaceId: tenant.currentWorkspace.id,
        postId,
        decidedByUserId: tenant.user.id,
        decision,
      })
    : await requestApprovalForPost({
        workspaceId: tenant.currentWorkspace.id,
        postId,
        requestedByUserId: tenant.user.id,
        policySnapshot: {
          approvalWorkflowMode,
          postStatus: post.status,
          postTitle: post.title,
        },
      });

  if (!result.approvalRequest) {
    return NextResponse.json(
      { error: result.reason ?? "Unable to update approval request." },
      { status: 409 }
    );
  }

  await recordTenantAuditEvent(tenant, {
    action: decision ? "post.approval.decided" : "post.approval.requested",
    targetType: "post",
    targetId: postId,
    metadata: {
      status: result.approvalRequest.approvalState,
      decision: decision ? humanizeApprovalDecision(decision) : undefined,
      endpoint: `POST /api/posts/${postId}/approval-request`,
      approvalRequestId: result.approvalRequest.id,
      approvalWorkflowMode,
      created: "created" in result ? result.created : false,
      updated: "updated" in result ? result.updated : false,
    },
  });

  return NextResponse.json({
    approvalRequest: result.approvalRequest,
    created: "created" in result ? result.created : false,
    updated: "updated" in result ? result.updated : false,
  });
}

async function readJsonBody(request: Request) {
  try {
    const raw = await request.text();
    if (!raw.trim()) {
      return { ok: true, body: null } as const;
    }

    const parsed = JSON.parse(raw) as unknown;
    const result = approvalRequestBodySchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: "Invalid approval request body." } as const;
    }

    if (result.data.decision && !normalizeApprovalDecision(result.data.decision)) {
      return { ok: false, error: "Invalid approval decision." } as const;
    }

    return { ok: true, body: result.data } as const;
  } catch {
    return { ok: false, error: "Invalid approval request body." } as const;
  }
}
