import { z } from "zod";

import { buildAgentAuditRecord, type AgentAuditRecord } from "@/agent/audit";
import { shouldRequireToolConfirmation } from "@/agent/guardrails";
import { getAgentTool } from "@/agent/registry";
import type { AgentToolCall, AgentToolPlan, AgentRuntimeContext } from "@/agent/types";

export function planAgentToolCall(input: {
  toolCall: AgentToolCall;
}): AgentToolPlan {
  const tool = getAgentTool(input.toolCall.name);
  if (!tool) {
    return {
      state: "invalid_tool",
      toolName: input.toolCall.name,
    };
  }

  const parsed = tool.inputSchema.safeParse(input.toolCall.input);
  if (!parsed.success) {
    return {
      state: "invalid_input",
      toolName: tool.name,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const confirmation = shouldRequireToolConfirmation(tool);
  if (confirmation.required) {
    return {
      state: "confirmation_required",
      tool,
      input: parsed.data,
      reason: confirmation.reason,
    };
  }

  return {
    state: "ready",
    tool,
    input: parsed.data,
  };
}

export async function executePlannedAgentTool(
  plan: Extract<AgentToolPlan, { state: "ready" }>,
  context: AgentRuntimeContext
) {
  const result = await plan.tool.execute(plan.input as z.input<typeof plan.tool.inputSchema>, context);

  return {
    result,
    audit: buildAgentAuditRecord({
      context,
      action: plan.tool.name,
      targetType: "agent-tool",
      targetId: null,
      status: result.ok ? "success" : "failure",
      metadata: {
        toolName: plan.tool.name,
        toolCategory: plan.tool.category,
        confirmationRequired: plan.tool.confirmation.required,
        input: plan.input,
        output: result.ok ? result.data : null,
        error: result.ok ? null : result.error,
      },
    }) satisfies AgentAuditRecord,
  };
}

export function normalizeAgentToolCallInput<T>(schema: z.ZodType<T>, value: unknown) {
  return schema.parse(value);
}
