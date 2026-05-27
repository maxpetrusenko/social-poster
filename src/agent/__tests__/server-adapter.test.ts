import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAgentRuntimeContextFromTenant,
  executeSafeInternalAgentToolCall,
  toTenantAuditEventInput,
} from "@/agent/server-adapter";
import type { TenantContext } from "@/lib/tenancy";

const tenant = {
  organization: {
    id: "org_1",
    name: "Max Social",
  },
  currentWorkspace: {
    id: "ws_1",
    name: "Main Workspace",
  },
  user: {
    id: "user_1",
    email: "max@example.com",
  },
} as unknown as TenantContext;

const dashboardContext = {
  summary: {
    enabledPlatformCount: 1,
    disabledPlatformCount: 1,
    missingPlatformCount: 0,
    profileCount: 0,
    scheduleCount: 0,
    postCount: 5,
    reviewReplyCount: 2,
    readyReplyCount: 1,
    postedReplyCount: 0,
    replyEventCount: 2,
    pipelineRunCount: 1,
    rssSourceCount: 0,
  },
  platforms: [
    {
      type: "x",
      label: "X",
      name: "Main X",
      handle: "@max",
      provider: "bird",
      enabled: true,
      connectionState: "active",
      capabilities: {},
      warnings: [],
    },
    {
      type: "linkedin",
      label: "LinkedIn",
      name: "Main LinkedIn",
      handle: "max",
      provider: "native",
      enabled: false,
      connectionState: "disabled",
      capabilities: {},
      warnings: [],
    },
  ],
  recentPosts: [
    {
      title: "Draft post",
      status: "draft",
      contentType: "text",
      scheduledAt: null,
      targets: [],
    },
  ],
  replies: {
    review: [],
    ready: [],
    postedRecent: [],
    skippedRecent: [],
    recentEvents: [
      {
        platformLabel: "X",
        author: "@alice",
        lane: "review",
        status: "new",
        replyText: "Draft reply",
        error: null,
        createdAt: "2026-04-21T11:00:00.000Z",
      },
    ],
  },
  pipelineRuns: [
    {
      status: "succeeded",
      trigger: "manual",
      scheduleName: "Morning",
      postTitle: "Pipeline post",
      error: null,
      durationMs: 1200,
      startedAt: "2026-04-21T11:05:00.000Z",
      completedAt: "2026-04-21T11:05:01.200Z",
    },
  ],
} as unknown as NonNullable<
  Parameters<typeof buildAgentRuntimeContextFromTenant>[0]["dashboardContext"]
>;

describe("agent server adapter", () => {
  it("maps tenant and dashboard context into an agent runtime context", () => {
    const runtimeContext = buildAgentRuntimeContextFromTenant({
      tenant,
      dashboardContext,
      now: new Date("2026-04-21T12:00:00.000Z"),
    });

    expect(runtimeContext).toMatchObject({
      organizationId: "org_1",
      organizationName: "Max Social",
      workspaceId: "ws_1",
      workspaceName: "Main Workspace",
      actorUserId: "user_1",
      actorEmail: "max@example.com",
      connectedPlatformTypes: ["twitter", "linkedin"],
      summary: {
        workspace: {
          id: "ws_1",
          name: "Main Workspace",
          organizationName: "Max Social",
        },
        counts: {
          platforms: 2,
          posts: 5,
          activities: 3,
          drafts: 1,
        },
      },
    });
    expect(runtimeContext.activity).toHaveLength(2);
  });

  it("executes a safe internal tool and converts the audit record for tenant logging", async () => {
    const execution = await executeSafeInternalAgentToolCall({
      tenant,
      dashboardContext,
      now: new Date("2026-04-21T12:00:00.000Z"),
      toolCall: {
        name: "internal_post_create_draft",
        input: {
          content: "Draft a concise launch update",
          title: "Launch update",
        },
      },
    });

    expect(execution.result).toEqual({
      ok: true,
      data: {
        workspaceId: "ws_1",
        platformType: null,
        title: "Launch update",
        content: "Draft a concise launch update",
        sourceUrl: null,
        firstComment: null,
        tags: [],
        status: "draft",
        createdBy: {
          userId: "user_1",
          email: "max@example.com",
        },
      },
    });
    expect(execution.audit).toMatchObject({
      action: "internal_post_create_draft",
      targetType: "agent-tool",
      status: "success",
    });
    expect(execution.tenantAuditEvent).toMatchObject({
      action: "internal_post_create_draft",
      targetType: "agent-tool",
      workspaceId: "ws_1",
      metadata: expect.objectContaining({
        agentAuditStatus: "success",
        agentAuditId: execution.audit?.id,
      }),
    });
  });

  it("refuses to execute non-safe tools", async () => {
    const execution = await executeSafeInternalAgentToolCall({
      tenant,
      toolCall: {
        name: "internal_publish_post",
        input: {},
      },
    });

    expect(execution.plan.state).toBe("invalid_tool");
    expect(execution.result).toBeNull();
    expect(execution.audit).toBeNull();
    expect(execution.tenantAuditEvent).toBeNull();
  });

  it("converts agent audit records into tenant audit event inputs", () => {
    const tenantAuditEvent = toTenantAuditEventInput({
      id: "audit_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      actorUserId: "user_1",
      actorEmail: "max@example.com",
      action: "internal_post_create_draft",
      targetType: "agent-tool",
      targetId: null,
      status: "success",
      metadata: {
        toolName: "internal_post_create_draft",
      },
      createdAt: new Date("2026-04-21T12:00:00.000Z"),
    });

    expect(tenantAuditEvent).toEqual({
      action: "internal_post_create_draft",
      targetType: "agent-tool",
      targetId: null,
      workspaceId: "ws_1",
      metadata: {
        toolName: "internal_post_create_draft",
        agentAuditId: "audit_1",
        agentAuditStatus: "success",
        agentAuditCreatedAt: "2026-04-21T12:00:00.000Z",
      },
    });
  });
});
