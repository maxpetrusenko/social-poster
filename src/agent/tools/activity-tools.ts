import { z } from "zod";

import { defineAgentTool, type AgentContextSummarySnapshot, type AgentToolExecutionResult } from "@/agent/types";

const emptySummary = (context: {
  workspaceId: string;
  workspaceName: string;
  organizationName: string;
}): AgentContextSummarySnapshot => ({
  workspace: {
    id: context.workspaceId,
    name: context.workspaceName,
    organizationName: context.organizationName,
  },
  counts: {
    platforms: 0,
    posts: 0,
    activities: 0,
    drafts: 0,
  },
});

export const internalContextSummaryTool = defineAgentTool({
  name: "internal_context_summary",
  description: "Return the current workspace summary that the agent may use for read-only replies.",
  category: "read",
  confirmation: {
    required: false,
    reason: "Read-only context lookups never require confirmation.",
  },
  inputSchema: z.object({}),
  async execute(_input, context) {
    return {
      ok: true,
      data: context.summary ?? emptySummary(context),
    } satisfies AgentToolExecutionResult<AgentContextSummarySnapshot>;
  },
});

export const internalActivityListTool = defineAgentTool({
  name: "internal_activity_list",
  description: "Return the recent workspace activity feed for read-only agent replies.",
  category: "read",
  confirmation: {
    required: false,
    reason: "Read-only activity lookups never require confirmation.",
  },
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(10),
  }),
  async execute(input, context) {
    const items = (context.activity ?? []).slice(0, input.limit);

    return {
      ok: true,
      data: {
        items,
        totalCount: context.activity?.length ?? 0,
        returnedCount: items.length,
      },
    } satisfies AgentToolExecutionResult<{
      items: typeof items;
      totalCount: number;
      returnedCount: number;
    }>;
  },
});
