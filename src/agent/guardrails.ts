import type { AgentConfirmationPolicy, AgentToolCategory } from "@/agent/types";

type AgentToolGuardrailShape = {
  category: AgentToolCategory;
  confirmation: AgentConfirmationPolicy;
};

export function shouldRequireToolConfirmation(
  tool: AgentToolGuardrailShape
) {
  if (tool.confirmation.required) {
    return tool.confirmation;
  }

  if (tool.category === "publish" || tool.category === "delete" || tool.category === "admin") {
    return {
      required: true,
      reason: tool.confirmation.reason,
    } satisfies AgentConfirmationPolicy;
  }

  return {
    required: false,
    reason: tool.confirmation.reason,
  } satisfies AgentConfirmationPolicy;
}

export function canExecuteToolWithoutConfirmation(
  tool: AgentToolGuardrailShape
) {
  return !shouldRequireToolConfirmation(tool).required;
}
