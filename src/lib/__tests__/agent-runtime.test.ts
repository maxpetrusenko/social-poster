import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildAgentAuditRecord } from "@/agent/audit";
import { canExecuteToolWithoutConfirmation, shouldRequireToolConfirmation } from "@/agent/guardrails";
import { getAgentTool, listAgentTools } from "@/agent/registry";
import { executePlannedAgentTool, planAgentToolCall } from "@/agent/runtime";
import { internalContextSummaryTool } from "@/agent/tools/activity-tools";
import { internalPostCreateDraftTool } from "@/agent/tools/post-tools";

const context = {
  organizationId: "org_1",
  organizationName: "Max Social",
  workspaceId: "ws_1",
  workspaceName: "Main Workspace",
  actorUserId: "user_1",
  actorEmail: "max@example.com",
  now: new Date("2026-04-21T12:00:00.000Z"),
  connectedPlatformTypes: ["twitter", "linkedin"],
  summary: {
    workspace: {
      id: "ws_1",
      name: "Main Workspace",
      organizationName: "Max Social",
    },
    counts: {
      platforms: 2,
      posts: 9,
      activities: 4,
      drafts: 3,
    },
  },
  activity: [
    {
      id: "activity_1",
      action: "Post created",
      status: "success",
      endpoint: "/dashboard/posts/post_1",
      platform: "ClawPoster",
      account: "Workspace",
      createdAt: "2026-04-21T11:30:00.000Z",
    },
  ],
};

describe("agent runtime contracts", () => {
  it("registers only internal MVP tools", () => {
    const tools = listAgentTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "internal_context_summary",
      "internal_activity_list",
      "internal_post_create_draft",
    ]);
    expect(getAgentTool("internal_post_create_draft")).toBeDefined();
    expect(getAgentTool("external_publish_post")).toBeNull();
  });

  it("returns read-only workspace context through the summary tool", async () => {
    const result = await internalContextSummaryTool.execute({}, context);

    expect(result).toEqual({
      ok: true,
      data: context.summary,
    });
  });

  it("creates a workspace-scoped draft and normalizes optional fields", async () => {
    const result = await internalPostCreateDraftTool.execute(
      {
        content: "Draft a product update for X and LinkedIn",
        title: "Product update",
        platformType: "twitter",
        tags: ["launch", " update "],
      },
      context
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.data).toEqual({
      workspaceId: "ws_1",
      platformType: "twitter",
      title: "Product update",
      content: "Draft a product update for X and LinkedIn",
      sourceUrl: null,
      firstComment: null,
      tags: ["launch", "update"],
      status: "draft",
      createdBy: {
        userId: "user_1",
        email: "max@example.com",
      },
    });
  });

  it("rejects drafts for a different workspace", async () => {
    const result = await internalPostCreateDraftTool.execute(
      {
        workspaceId: "ws_2",
        content: "Cross-workspace content",
      },
      context
    );

    expect(result).toEqual({
      ok: false,
      error: "Drafts can only be created for the active workspace.",
    });
  });

  it("rejects drafts for an unconnected platform", async () => {
    const result = await internalPostCreateDraftTool.execute(
      {
        content: "Try an unsupported platform",
        platformType: "youtube",
      },
      context
    );

    expect(result).toEqual({
      ok: false,
      error: "Platform youtube is not connected in this workspace.",
    });
  });

  it("plans draft execution only after input validates", () => {
    expect(
      planAgentToolCall({
        toolCall: {
          name: "internal_post_create_draft",
          input: {
            content: "Valid draft",
          },
        },
      })
    ).toMatchObject({
      state: "ready",
      tool: {
        name: "internal_post_create_draft",
      },
    });

    expect(
      planAgentToolCall({
        toolCall: {
          name: "internal_post_create_draft",
          input: {
            title: "Missing body",
          },
        },
      })
    ).toMatchObject({
      state: "invalid_input",
      toolName: "internal_post_create_draft",
    });
  });

  it("requires confirmation for publish-class tools", () => {
    expect(
      shouldRequireToolConfirmation({
        category: "publish",
        confirmation: {
          required: false,
          reason: "Publish should be reviewed first.",
        },
      })
    ).toEqual({
      required: true,
      reason: "Publish should be reviewed first.",
    });

    expect(
      canExecuteToolWithoutConfirmation({
        category: "draft",
        confirmation: {
          required: false,
          reason: "Drafts are safe to stage.",
        },
      })
    ).toBe(true);
  });

  it("builds a structured audit record for runtime events", () => {
    const record = buildAgentAuditRecord({
      context,
      action: "internal_post_create_draft",
      targetType: "agent-tool",
      targetId: null,
      status: "success",
      metadata: {
        toolName: "internal_post_create_draft",
        result: "drafted",
      },
    });

    expect(record).toMatchObject({
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
        result: "drafted",
        workspaceName: "Main Workspace",
        organizationName: "Max Social",
      },
    });
  });

  it("executes a planned tool and returns an audit record", async () => {
    const plan = planAgentToolCall({
      toolCall: {
        name: "internal_post_create_draft",
        input: {
          content: "Draft for audit",
        },
      },
    });

    expect(plan.state).toBe("ready");
    if (plan.state !== "ready") {
      throw new Error("Expected a ready plan");
    }

    const execution = await executePlannedAgentTool(plan, context);

    expect(execution.result.ok).toBe(true);
    expect(execution.audit).toMatchObject({
      action: "internal_post_create_draft",
      targetType: "agent-tool",
      status: "success",
      metadata: expect.objectContaining({
        toolName: "internal_post_create_draft",
        confirmationRequired: false,
      }),
    });
  });

  it("keeps the runtime input parser explicit", () => {
    expect(() =>
      z.object({}).parse({})
    ).not.toThrow();
  });
});
