import "server-only";

import { buildAgentAuditRecord, type AgentAuditRecord } from "@/agent/audit";
import { executePlannedAgentTool, planAgentToolCall } from "@/agent/runtime";
import { getAgentTool } from "@/agent/registry";
import type { AgentActivityEntry, AgentRuntimeContext, AgentToolCall } from "@/agent/types";
import type { SocialAgentContext } from "@/lib/social-agent/context";
import type { TenantContext } from "@/lib/tenancy";

type DashboardContext = Pick<
  SocialAgentContext,
  "platforms" | "recentPosts" | "replies" | "pipelineRuns" | "summary"
>;

export type TenantAuditEventInput = {
  action: string;
  targetType: string;
  targetId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
};

export function buildAgentRuntimeContextFromTenant(input: {
  tenant: TenantContext;
  dashboardContext?: DashboardContext | null;
  now?: Date;
}): AgentRuntimeContext {
  const dashboardContext = input.dashboardContext ?? null;

  return {
    organizationId: input.tenant.organization.id,
    organizationName: input.tenant.organization.name,
    workspaceId: input.tenant.currentWorkspace.id,
    workspaceName: input.tenant.currentWorkspace.name,
    actorUserId: input.tenant.user.id,
    actorEmail: input.tenant.user.email,
    now: input.now ?? new Date(),
    connectedPlatformTypes: buildConnectedPlatformTypes(dashboardContext),
    summary: buildSummarySnapshot(input.tenant, dashboardContext),
    activity: buildActivityEntries(dashboardContext),
  };
}

export function toTenantAuditEventInput(record: AgentAuditRecord): TenantAuditEventInput {
  return {
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    workspaceId: record.workspaceId,
    metadata: {
      ...record.metadata,
      agentAuditId: record.id,
      agentAuditStatus: record.status,
      agentAuditCreatedAt: record.createdAt.toISOString(),
    },
  };
}

export async function executeSafeInternalAgentToolCall(input: {
  tenant: TenantContext;
  toolCall: AgentToolCall;
  dashboardContext?: DashboardContext | null;
  now?: Date;
}) {
  const context = buildAgentRuntimeContextFromTenant(input);
  const plan = planAgentToolCall({ toolCall: input.toolCall });

  if (plan.state !== "ready") {
    return {
      context,
      plan,
      result: null,
      audit: null,
      tenantAuditEvent: null,
    };
  }

  const tool = getAgentTool(plan.tool.name);
  if (!tool || !isSafeInternalTool(tool.name)) {
    const audit = buildAgentAuditRecord({
      context,
      action: plan.tool.name,
      targetType: "agent-tool",
      targetId: null,
      status: "blocked",
      metadata: {
        toolName: plan.tool.name,
        reason: "Tool is not part of the safe internal runtime slice.",
      },
    });

    return {
      context,
      plan,
      result: {
        ok: false,
        error: "Tool is not part of the safe internal runtime slice.",
      } as const,
      audit,
      tenantAuditEvent: toTenantAuditEventInput(audit),
    };
  }

  const execution = await executePlannedAgentTool(plan, context);
  return {
    context,
    plan,
    result: execution.result,
    audit: execution.audit,
    tenantAuditEvent: toTenantAuditEventInput(execution.audit),
  };
}

function isSafeInternalTool(toolName: string) {
  return SAFE_INTERNAL_TOOL_NAMES.has(toolName);
}

const SAFE_INTERNAL_TOOL_NAMES = new Set([
  "internal_context_summary",
  "internal_activity_list",
  "internal_post_create_draft",
]);

function buildConnectedPlatformTypes(context: DashboardContext | null) {
  return (context?.platforms ?? []).map((platform) =>
    platform.type === "x" ? "twitter" : platform.type
  );
}

function buildSummarySnapshot(
  tenant: TenantContext,
  context: DashboardContext | null
): AgentRuntimeContext["summary"] {
  if (!context) return undefined;

  return {
    workspace: {
      id: tenant.currentWorkspace.id,
      name: tenant.currentWorkspace.name,
      organizationName: tenant.organization.name,
    },
    counts: {
      platforms:
        (context.summary?.enabledPlatformCount ?? 0) +
        (context.summary?.disabledPlatformCount ?? 0),
      posts: context.summary?.postCount ?? 0,
      activities:
        (context.summary?.replyEventCount ?? 0) + (context.summary?.pipelineRunCount ?? 0),
      drafts: context.recentPosts?.filter((post) => post.status === "draft").length ?? 0,
    },
  };
}

function buildActivityEntries(context: DashboardContext | null): AgentActivityEntry[] | undefined {
  if (!context) return undefined;

  const replyEvents = context.replies.recentEvents.map((event, index) => ({
    id: `reply-event-${index}-${event.createdAt ?? "unknown"}`,
    action: `Reply ${event.lane}`,
    status: event.status,
    endpoint: "/dashboard/replies",
    platform: event.platformLabel,
    account: event.author,
    createdAt: event.createdAt ?? new Date().toISOString(),
  }));

  const pipelineRuns = context.pipelineRuns.map((run, index) => ({
    id: `pipeline-run-${index}-${run.startedAt ?? run.completedAt ?? "unknown"}`,
    action: `Pipeline ${run.status}`,
    status: run.status,
    endpoint: "/dashboard/pipeline",
    platform: "Pipeline",
    account: run.scheduleName ?? run.postTitle ?? "Workspace",
    createdAt: run.startedAt ?? run.completedAt ?? new Date().toISOString(),
  }));

  return [...replyEvents, ...pipelineRuns];
}
