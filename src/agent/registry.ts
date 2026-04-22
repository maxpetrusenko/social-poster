import { internalActivityListTool, internalContextSummaryTool } from "@/agent/tools/activity-tools";
import { internalPostCreateDraftTool } from "@/agent/tools/post-tools";

export const INTERNAL_AGENT_TOOLS = [
  internalContextSummaryTool,
  internalActivityListTool,
  internalPostCreateDraftTool,
] as const;

export type InternalAgentToolName = (typeof INTERNAL_AGENT_TOOLS)[number]["name"];

const TOOL_BY_NAME = new Map(INTERNAL_AGENT_TOOLS.map((tool) => [tool.name, tool] as const));

export function listAgentTools() {
  return [...INTERNAL_AGENT_TOOLS];
}

export function getAgentTool(name: string) {
  return TOOL_BY_NAME.get(name) ?? null;
}

export function isInternalAgentToolName(name: string): name is InternalAgentToolName {
  return TOOL_BY_NAME.has(name);
}
