import { z } from "zod";

export type AgentToolCategory = "read" | "draft" | "reply" | "publish" | "delete" | "admin";

export type AgentConfirmationPolicy = {
  required: boolean;
  reason: string;
};

export type AgentAuditStatus = "success" | "failure" | "blocked" | "confirmation_required";

export type AgentRuntimeContext = {
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  actorUserId: string;
  actorEmail: string;
  now?: Date;
  connectedPlatformTypes?: string[];
  summary?: AgentContextSummarySnapshot;
  activity?: AgentActivityEntry[];
};

export type AgentContextSummarySnapshot = {
  workspace: {
    id: string;
    name: string;
    organizationName: string;
  };
  counts: {
    platforms: number;
    posts: number;
    activities: number;
    drafts: number;
  };
};

export type AgentActivityEntry = {
  id: string;
  action: string;
  status: string;
  endpoint: string;
  platform: string;
  account: string;
  createdAt: string;
};

export type AgentToolExecutionSuccess<TOutput> = {
  ok: true;
  data: TOutput;
  message?: string;
};

export type AgentToolExecutionFailure = {
  ok: false;
  error: string;
  message?: string;
};

export type AgentToolExecutionResult<TOutput> =
  | AgentToolExecutionSuccess<TOutput>
  | AgentToolExecutionFailure;

export type AgentToolDefinition<TInputSchema extends z.ZodTypeAny, TOutput> = {
  name: string;
  description: string;
  category: AgentToolCategory;
  confirmation: AgentConfirmationPolicy;
  inputSchema: TInputSchema;
  execute: (
    input: z.input<TInputSchema>,
    context: AgentRuntimeContext
  ) => Promise<AgentToolExecutionResult<TOutput>>;
};

export type AgentToolCall = {
  name: string;
  input: unknown;
};

export type AgentToolPlan =
  | {
      state: "ready";
      tool: AgentToolDefinition<z.ZodTypeAny, unknown>;
      input: unknown;
    }
  | {
      state: "confirmation_required";
      tool: AgentToolDefinition<z.ZodTypeAny, unknown>;
      input: unknown;
      reason: string;
    }
  | {
      state: "invalid_tool";
      toolName: string;
    }
  | {
      state: "invalid_input";
      toolName: string;
      issues: string[];
    };

export function defineAgentTool<TInputSchema extends z.ZodTypeAny, TOutput>(
  definition: AgentToolDefinition<TInputSchema, TOutput>
) {
  return definition;
}
