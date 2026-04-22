import { z } from "zod";

import { defineAgentTool, type AgentToolExecutionResult } from "@/agent/types";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";

const draftPlatformSchema = z.enum(PLATFORM_TYPES);

const draftInputSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  platformType: draftPlatformSchema.optional(),
  title: z.string().trim().min(1).max(140).optional(),
  content: z.string().trim().min(1).max(5000),
  sourceUrl: z.string().url().optional(),
  firstComment: z.string().trim().min(1).max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export type InternalPostDraftInput = z.output<typeof draftInputSchema>;

export type InternalPostDraft = {
  workspaceId: string;
  platformType: PlatformType | null;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  firstComment: string | null;
  tags: string[];
  status: "draft";
  createdBy: {
    userId: string;
    email: string;
  };
};

export const internalPostCreateDraftTool = defineAgentTool({
  name: "internal_post_create_draft",
  description: "Create a workspace-scoped post draft without publishing or scheduling anything.",
  category: "draft",
  confirmation: {
    required: false,
    reason: "Draft creation is reversible and does not publish to any platform.",
  },
  inputSchema: draftInputSchema,
  async execute(input, context) {
    const workspaceId = input.workspaceId ?? context.workspaceId;
    const tags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

    if (workspaceId !== context.workspaceId) {
      return {
        ok: false,
        error: "Drafts can only be created for the active workspace.",
      } satisfies AgentToolExecutionResult<InternalPostDraft>;
    }

    if (input.platformType && !(context.connectedPlatformTypes ?? []).includes(input.platformType)) {
      return {
        ok: false,
        error: `Platform ${input.platformType} is not connected in this workspace.`,
      } satisfies AgentToolExecutionResult<InternalPostDraft>;
    }

    const draft: InternalPostDraft = {
      workspaceId,
      platformType: input.platformType ?? null,
      title: input.title ?? null,
      content: input.content,
      sourceUrl: input.sourceUrl ?? null,
      firstComment: input.firstComment ?? null,
      tags,
      status: "draft",
      createdBy: {
        userId: context.actorUserId,
        email: context.actorEmail,
      },
    };

    return {
      ok: true,
      data: draft,
    } satisfies AgentToolExecutionResult<InternalPostDraft>;
  },
});
