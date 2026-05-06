import crypto from "node:crypto";
import cron from "node-cron";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { blogAutomationPosts, platforms, profiles, rssSources, schedules } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { requireApiSession } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { sendWorkspaceInvitationEmail } from "@/lib/mail";
import {
  loadSocialAgentContext,
  type SocialAgentContext,
} from "@/lib/social-agent/context";
import { getArticleWorkspacePreview } from "@/lib/article-agent/workspace";
import {
  extractExplicitToolCall,
  type SocialAgentToolCommandEnvelope,
} from "@/app/api/social-agent/tool-command";
import {
  createSupportTicket,
  isSupportTicketSource,
  normalizeSupportTicketSource,
  SUPPORT_TICKET_SOURCES,
  type SupportTicketSource,
} from "@/lib/support/tickets";
import {
  createInvitation,
  requireTenantContext,
  WORKSPACE_ROLE_OPTIONS,
  type WorkspaceRole,
} from "@/lib/tenancy";
import { recordTenantAuditEvent } from "@/lib/audit";
import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveOpenAIResponsesRuntime } from "@/lib/model-runtime";
import { executeSafeInternalAgentToolCall } from "@/agent/server-adapter";
import { parseProductMode, type ProductMode } from "@/lib/user-preferences";
import { reconcileSchedules } from "@/lib/scheduler";
import {
  parseRecurringPostIntent,
  parseRssKeepIntent,
  sanitizeSocialAgentAttachments,
  type SocialAgentAttachment,
} from "@/lib/social-agent/action-intents";
import {
  formatLatestPostPublishStatus,
  isPostPublishStatusQuestion,
} from "@/lib/social-agent/post-status";

const MODEL =
  process.env.OPENAI_SOCIAL_AGENT_MODEL ||
  process.env.OPENAI_REPLY_MODEL ||
  "gpt-5-mini";
const INLINE_INVITE_ROLES = new Set<WorkspaceRole>([
  "viewer",
  "client",
  "contributor",
  "editor",
  "manager",
]);

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: SocialAgentAttachment[];
};

type ClientPageContext = {
  path?: string;
  title?: string;
  heading?: string;
  article?: {
    articleId?: string | null;
    openRef?: string | null;
    visibleTitle?: string | null;
    visiblePath?: string | null;
  } | null;
  currentArticle?: {
    source: "db" | "filesystem";
    title: string;
    status?: string | null;
    validation?: string | null;
    path?: string | null;
    excerpt?: string | null;
    contentPreview?: string | null;
    sources?: Array<{ title: string | null; url: string }>;
  } | null;
  replyLanguage?: string | null;
  productMode?: ProductMode;
};

type SupportTicketCommand = Pick<
  Parameters<typeof createSupportTicket>[0],
  "source" | "topic" | "explanation" | "imageUrl" | "sourceUrl" | "autoRepair"
>;

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const context = await loadSocialAgentContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    context,
    reply:
      "How can I help?\n\nI can make a post, check connected accounts, or create a support ticket.",
  });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    messages?: ChatMessage[];
    pageContext?: ClientPageContext;
    attachments?: unknown;
  } & SocialAgentToolCommandEnvelope;
  const attachments = sanitizeSocialAgentAttachments(body.attachments);
  const message = String(
    body.message || (attachments.length > 0 ? "Use the attached image." : "")
  ).trim();

  const pageContext = sanitizePageContext(body.pageContext);
  const context = await loadSocialAgentContext({
    replyLanguage: pageContext.replyLanguage,
  });
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const explicitToolCall = extractExplicitToolCall({
    message: body.message ?? null,
    toolCall: body.toolCall,
    command: body.command,
  });
  if (explicitToolCall) {
    const tenant = await requireTenantContext();
    const execution = await executeSafeInternalAgentToolCall({
      tenant,
      dashboardContext: context,
      toolCall: explicitToolCall,
    });

    if (execution.tenantAuditEvent) {
      await recordTenantAuditEvent(tenant, execution.tenantAuditEvent);
    }

    return NextResponse.json({
      context,
      reply: formatInternalToolCallReply(execution),
    });
  }

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const inlineAction = await handleInlineAction(
    message,
    request,
    pageContext,
    attachments
  );
  if (inlineAction) {
    const refreshedContext = await loadSocialAgentContext({
      replyLanguage: pageContext.replyLanguage,
    });
    return NextResponse.json({
      context: refreshedContext ?? context,
      reply: inlineAction,
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const reply = await answerWithContext(
    context,
    message,
    messages,
    pageContext,
    attachments
  );
  return NextResponse.json({ context, reply });
}

function formatInternalToolCallReply(
  execution: Awaited<ReturnType<typeof executeSafeInternalAgentToolCall>>
) {
  if (execution.plan.state === "ready") {
    const result = execution.result;
    if (!result) {
      return "Tool call failed: internal tool returned no result.";
    }

    if (result.ok) {
      if (typeof result.message === "string" && result.message.trim()) {
        return result.message;
      }

      return formatInternalToolSuccess(execution.plan.tool.name, result.data);
    }

    return `Tool call failed: ${result.error}`;
  }

  if (execution.plan.state === "confirmation_required") {
    return `Tool call blocked: ${execution.plan.reason}`;
  }

  if (execution.plan.state === "invalid_input") {
    return `Tool call rejected: ${execution.plan.issues.join("; ")}`;
  }

  return `Tool call rejected: ${execution.plan.toolName} is not available.`;
}

function formatInternalToolSuccess(toolName: string, data: unknown) {
  const record = isRecord(data) ? data : null;

  if (toolName === "internal_context_summary" && record) {
    const counts = isRecord(record.counts) ? record.counts : {};
    return [
      "Workspace summary:",
      `Platforms: ${numberLabel(counts.platforms)}`,
      `Posts: ${numberLabel(counts.posts)}`,
      `Drafts: ${numberLabel(counts.drafts)}`,
      `Recent activity: ${numberLabel(counts.activities)}`,
    ].join("\n");
  }

  if (toolName === "internal_activity_list" && record) {
    const items = Array.isArray(record.items) ? record.items : [];
    if (items.length === 0) return "No recent activity returned.";

    return [
      `Recent activity (${items.length}):`,
      ...items.slice(0, 10).map((item) => {
        const entry = isRecord(item) ? item : {};
        return `- ${stringLabel(entry.action, "Activity")} (${stringLabel(entry.status, "unknown")})`;
      }),
    ].join("\n");
  }

  if (toolName === "internal_post_create_draft" && record) {
    const title = stringLabel(record.title, "Untitled draft");
    const content = stringLabel(record.content, "").slice(0, 180);
    return `Draft prepared, not published.\nTitle: ${title}\n${content}`;
  }

  if (typeof data === "string") return data;
  return `Executed ${toolName}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberLabel(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function stringLabel(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function handleInlineAction(
  message: string,
  request: NextRequest,
  pageContext: ClientPageContext,
  attachments: SocialAgentAttachment[]
) {
  const rssKeepAction = await handleRssKeepAction(message);
  if (rssKeepAction) return rssKeepAction;

  const recurringPostAction = await handleRecurringPostAction(message, attachments);
  if (recurringPostAction) return recurringPostAction;

  const supportTicket = parseSupportCommand(message) ?? parseNaturalSupportRequest(message);
  if (supportTicket === "help") {
    return `Use \`/support type | topic | explanation | image-url\` to create a Linear ticket. Types: ${SUPPORT_TICKET_SOURCES.join(", ")}. The image URL is optional.`;
  }
  if (supportTicket) {
    try {
      const tenant = await requireTenantContext();
      const ticket = await createSupportTicket({
        ...supportTicket,
        sourceUrl: supportTicket.sourceUrl ?? pageContext.path ?? null,
        pageTitle: pageContext.title ?? pageContext.heading ?? null,
        reporter: {
          email: tenant.user.email,
          name: tenant.user.fullName,
          userId: tenant.user.id,
        },
        workspace: {
          id: tenant.currentWorkspace.id,
          name: tenant.currentWorkspace.name,
          organizationName: tenant.organization.name,
        },
      });
      const repair =
        ticket.repairAgent.status === "sent"
          ? ` Repair sent to ${ticket.repairAgent.host}.`
          : ticket.repairAgent.status === "not_configured"
            ? " Repair agent not configured yet."
            : "";
      return `Created ${ticket.issue.identifier}: ${ticket.issue.url}.${repair}`;
    } catch (error) {
      if (isSupportTicketConfigError(error)) {
        return formatPreparedSupportTicket(supportTicket);
      }
      const message = error instanceof Error ? error.message : "Support ticket could not be created.";
      return `Support ticket failed: ${message}`;
    }
  }

  const invite = parseInviteCommand(message);
  if (invite === "help") {
    return "Use `/invite email@example.com as viewer|client|contributor|editor|manager` to invite someone to the current workspace. Org admin access required.";
  }
  if (!invite) return null;

  try {
    const tenant = await requireTenantContext();
    const invitation = await createInvitation({
      email: invite.email,
      orgRole: "member",
      workspaceAssignments: [
        {
          workspaceId: tenant.currentWorkspace.id,
          role: invite.role,
        },
      ],
    });

    let delivery = "Invite email sent.";
    try {
      const result = await sendWorkspaceInvitationEmail({
        email: invitation.email,
        token: invitation.token,
        organizationName: tenant.organization.name,
        inviterName: tenant.user.fullName ?? tenant.user.email,
        baseUrl: getRequestAppUrl({ headers: request.headers, url: request.url }),
      });
      if (result.provider === "preview" || result.provider === "log") {
        delivery = "Invite created, but email delivery is not configured. Copy the access link from Users.";
      }
    } catch {
      delivery = "Invite created, but email delivery failed.";
    }

    return `${delivery}\n${invitation.email} now has pending ${invite.role} access for ${tenant.currentWorkspace.name}. Manage or copy the access link from Users.`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invite could not be created.";
    return `Invite failed: ${message}`;
  }
}

async function handleRssKeepAction(message: string) {
  const intent = parseRssKeepIntent(message);
  if (!intent) return null;

  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) {
    return "RSS source changes require editor access in this workspace.";
  }

  const sources = await db
    .select()
    .from(rssSources)
    .where(eq(rssSources.workspaceId, tenant.currentWorkspace.id));

  if (sources.length === 0) {
    return "No RSS sources are configured in this workspace.";
  }

  if (sources.length === 1) {
    return `Only one RSS source is configured: ${sources[0]?.name}. Nothing to remove.`;
  }

  if (!intent.keepQuery) {
    return [
      "Which RSS source should stay?",
      ...sources.map((source, index) => `${index + 1}. ${source.name} (${source.url})`),
    ].join("\n");
  }

  const keepQuery = intent.keepQuery ?? "";
  const matches = sources.filter((source) => rssSourceMatches(source, keepQuery));
  if (matches.length === 0) {
    return `I could not find an RSS source matching "${keepQuery}".`;
  }
  if (matches.length > 1) {
    return [
      `"${keepQuery}" matches multiple RSS sources. Which one should stay?`,
      ...matches.map((source, index) => `${index + 1}. ${source.name} (${source.url})`),
    ].join("\n");
  }

  const keep = matches[0];
  const toDelete = sources.filter((source) => source.id !== keep.id);
  for (const source of toDelete) {
    await db
      .delete(rssSources)
      .where(
        and(
          eq(rssSources.workspaceId, tenant.currentWorkspace.id),
          eq(rssSources.id, source.id)
        )
      );
  }

  await recordTenantAuditEvent(tenant, {
    action: "rss_sources.bulk_delete_except",
    targetType: "rss_source",
    targetId: keep.id,
    metadata: {
      endpoint: "POST /api/social-agent",
      keptName: keep.name,
      deletedCount: toDelete.length,
    },
  });

  return `Removed ${toDelete.length} RSS source${toDelete.length === 1 ? "" : "s"}. Kept ${keep.name}.`;
}

async function handleRecurringPostAction(
  message: string,
  attachments: SocialAgentAttachment[]
) {
  const intent = parseRecurringPostIntent(message, attachments);
  if (!intent) return null;

  const missing: string[] = [];
  if (!intent.cron) missing.push("cadence, for example daily at 9 AM");
  if (!intent.content && !intent.mediaUrl) missing.push("post copy after a colon");
  if (missing.length > 0) {
    return `I can create that recurring post. Add ${missing.join(" and ")}. Example: create recurring post daily at 9 AM on X: Launch note text.`;
  }

  const scheduleCron = intent.cron ?? "";
  if (!cron.validate(scheduleCron)) {
    return `The recurring cadence did not produce a valid cron expression: ${scheduleCron}.`;
  }

  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) {
    return "Recurring post creation requires editor access in this workspace.";
  }

  const workspaceId = tenant.currentWorkspace.id;
  const [profileRows, platformRows] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.workspaceId, workspaceId)),
    db.select().from(platforms).where(eq(platforms.workspaceId, workspaceId)),
  ]);
  const profile = profileRows.find((row) => row.isDefault) ?? profileRows[0] ?? null;
  if (!profile) {
    return "Create a profile first, then I can attach recurring posts to it.";
  }

  const enabledPlatforms = platformRows.filter((platform) => platform.enabled);
  const selectedPlatforms = intent.platformQuery
    ? enabledPlatforms.filter((platform) =>
        platformMatchesQuery(platform, intent.platformQuery ?? "")
      )
    : enabledPlatforms;

  if (selectedPlatforms.length === 0) {
    return intent.platformQuery
      ? `No enabled platform matched "${intent.platformQuery}".`
      : "Connect and enable at least one platform first.";
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const hasMedia = Boolean(intent.mediaUrl);
  const name =
    intent.name ??
    `Recurring ${hasMedia ? "image" : "text"} post ${now.toISOString().slice(0, 10)}`;
  const content = intent.content ?? "Image post";
  const config: Record<string, unknown> = {
    postMode: "fixed",
    title: name,
    summary: "Created from SMM Agent chat",
    content,
    contentCategory: "opinion_take",
  };
  if (intent.mediaUrl) config.mediaUrl = intent.mediaUrl;

  const [row] = await db
    .insert(schedules)
    .values({
      id,
      workspaceId,
      name,
      description: "Created from SMM Agent chat.",
      cron: scheduleCron,
      cronHuman: intent.cronHuman,
      jobType: hasMedia ? "image_post" : "text_post",
      profileId: profile.id,
      targetPlatformIds: selectedPlatforms.map((platform) => platform.id),
      config,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await reconcileSchedules("social-agent:schedule:create");
  await recordTenantAuditEvent(tenant, {
    action: "schedule.create",
    targetType: "schedule",
    targetId: id,
    metadata: {
      status: "scheduled",
      endpoint: "POST /api/social-agent",
      jobType: row.jobType,
      platformTargetCount: selectedPlatforms.length,
      source: "social-agent",
      hasMedia,
    },
  });

  const targetLabels = selectedPlatforms
    .map((platform) => platform.handle || platform.name || platform.type)
    .join(", ");
  return `Created recurring ${hasMedia ? "image" : "text"} post schedule "${row.name}" for ${targetLabels} on ${row.cronHuman ?? row.cron}.`;
}

function rssSourceMatches(
  source: typeof rssSources.$inferSelect,
  query: string
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  const haystack = [
    source.name,
    source.url,
    safeHostname(source.url),
  ]
    .map(normalizeSearchText)
    .filter(Boolean);

  return haystack.some(
    (value) => value === normalizedQuery || value.includes(normalizedQuery)
  );
}

function platformMatchesQuery(
  platform: typeof platforms.$inferSelect,
  query: string
) {
  const terms = query
    .split(/,|\/|\+|\band\b/i)
    .map(normalizeSearchText)
    .filter(Boolean);
  if (terms.length === 0) return false;

  const values = [
    platform.type,
    platform.name,
    platform.handle ?? "",
    platform.type === "x" ? "twitter" : "",
  ]
    .map(normalizeSearchText)
    .filter(Boolean);

  return terms.some((term) =>
    values.some((value) => value === term || value.includes(term) || term.includes(value))
  );
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function parseInviteCommand(
  message: string
): { email: string; role: WorkspaceRole } | "help" | null {
  const normalized = message.trim();
  if (/^invite\s+/i.test(normalized)) return "help";
  if (!/^\/invite\s+/i.test(normalized)) return null;

  const match = normalized.match(
    /^\/invite\s+([^\s@]+@[^\s@]+\.[^\s@]+)(?:\s+as\s+([a-z_]+))?$/i
  );
  if (!match) return "help";

  const role = (match[2]?.toLowerCase() || "viewer") as WorkspaceRole;
  if (!WORKSPACE_ROLE_OPTIONS.includes(role) || !INLINE_INVITE_ROLES.has(role)) {
    return "help";
  }

  return {
    email: match[1].toLowerCase(),
    role,
  };
}

function parseSupportCommand(
  message: string
): SupportTicketCommand | "help" | null {
  const normalized = message.trim();
  if (/^support\s+/i.test(normalized)) return "help";
  const commandIndex = normalized.search(/\/support\b/i);
  if (commandIndex < 0) return null;
  if (commandIndex > 0 && !normalized.slice(commandIndex).includes("|")) {
    return null;
  }
  if (commandIndex > 0) {
    const prefix = normalized.slice(0, commandIndex).toLowerCase();
    const isCommandIntent =
      /\b(run|execute|submit|send|create|file|open)\b/.test(prefix) ||
      /\b(use this|paste this|command)\b/.test(prefix);
    const isFormatDiscussion = /\b(format|syntax|example|like)\b/.test(prefix);
    if (!isCommandIntent || isFormatDiscussion) return null;
  }

  const command = normalized.slice(commandIndex).replace(/[`"“”]+$/g, "").trim();
  const raw = command.replace(/^\/support\b/i, "").trim();
  if (!raw) return "help";

  const segments = raw
    .split(/\s*\|\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return "help";

  const first = segments[0]?.replace(/[\s-]+/g, "_").toLowerCase() ?? "";
  const hasExplicitSource = isSupportTicketSource(first);
  const source = hasExplicitSource
    ? normalizeSupportTicketSource(first, "from_bot")
    : "from_bot";
  const topic = hasExplicitSource ? segments[1] : segments[0];
  const explanation = hasExplicitSource ? segments[2] : segments[1];
  const imageUrl = hasExplicitSource ? segments[3] : segments[2];
  if (!topic || !explanation) return "help";

  return {
    source: source as SupportTicketSource,
    topic,
    explanation,
    imageUrl: isHttpUrl(imageUrl) ? imageUrl : null,
    sourceUrl: isHttpUrl(imageUrl) ? null : imageUrl || null,
    autoRepair: source === "from_bot" || /\b(fix|repair|pr|pull request)\b/i.test(raw),
  };
}

function parseNaturalSupportRequest(message: string): SupportTicketCommand | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  if (!isSupportDraftRequest(lowered)) {
    const labeledTicket = parseLabeledSupportTicket(normalized);
    if (labeledTicket) return labeledTicket;
  }

  if (/\b(should i|would that|maybe|not sure|do i need|or should|could it)\b/.test(lowered)) {
    return null;
  }

  const asksForTicket =
    /\b(open|create|make|file)\s+(?:a\s+)?(?:support\s+)?ticket\b/.test(lowered) ||
    /\breport\s+(?:an?\s+)?issue\b/.test(lowered) ||
    /\bescalate\b/.test(lowered);
  if (!asksForTicket) return null;

  const looksLikeIssue =
    lowered.includes("failed") ||
    lowered.includes("error") ||
    lowered.includes("can't") ||
    lowered.includes("cannot") ||
    lowered.includes("not working") ||
    lowered.includes("broken") ||
    lowered.includes("connect") ||
    lowered.includes("blocker") ||
    lowered.includes("logs") ||
    lowered.includes("deploy");
  if (!looksLikeIssue) return null;

  return {
    source: lowered.includes("bot") || lowered.includes("agent")
      ? "from_bot"
      : "from_user_triage",
    topic: inferSupportTopic(normalized),
    explanation: normalized,
    imageUrl: null,
    sourceUrl: null,
    autoRepair: /\b(fix|repair|pr|pull request)\b/i.test(normalized),
  };
}

function parseLabeledSupportTicket(message: string): SupportTicketCommand | null {
  const source = message.match(/\b(?:source|type):\s*([a-z_ -]+)/i)?.[1]?.trim();
  const topic = message.match(/\btopic:\s*([^]+?)(?=\s+(?:explanation|image url):|$)/i)?.[1]?.trim();
  const explanation = message.match(/\bexplanation:\s*([^]+?)(?=\s+image url:|$)/i)?.[1]?.trim();
  const imageUrl = message.match(/\bimage url:\s*(\S+)/i)?.[1]?.trim();

  if (!topic || !explanation) return null;

  return {
    source: normalizeSupportTicketSource(source, "from_user_triage"),
    topic,
    explanation,
    imageUrl: isHttpUrl(imageUrl) ? imageUrl : null,
    sourceUrl: null,
    autoRepair: false,
  };
}

function inferSupportTopic(message: string) {
  const lowered = message.toLowerCase();
  if (lowered.includes("facebook") && lowered.includes("connect")) {
    return "Facebook connection failed";
  }
  if (lowered.includes("failed to fetch")) {
    return "Failed to fetch";
  }

  return message
    .replace(/^.*?\b(?:open|create|make|file)\s+(?:a\s+)?ticket\b[:\s-]*/i, "")
    .replace(/^.*?\breport\s+(?:an?\s+)?issue\b[:\s-]*/i, "")
    .trim()
    .slice(0, 120) || "Support issue";
}

function isSupportTicketConfigError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Support ticket could not be created.";
  return /LINEAR_API_KEY|Linear support tickets/i.test(message);
}

function formatPreparedSupportTicket(ticket: SupportTicketCommand) {
  return [
    "Support ticket prepared, but not created because Linear is not configured in this environment.",
    `Type: ${ticket.source}`,
    `Topic: ${truncateForChat(ticket.topic, 120)}`,
    `Explanation: ${truncateForChat(ticket.explanation, 220)}`,
    ticket.imageUrl ? `Image: ${ticket.imageUrl}` : "",
    "Copy this into Linear or rerun the same command after Linear is configured.",
  ].filter(Boolean).join("\n");
}

function truncateForChat(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

async function answerWithContext(
  context: SocialAgentContext,
  message: string,
  messages: ChatMessage[],
  pageContext: ClientPageContext,
  attachments: SocialAgentAttachment[] = []
) {
  const directReply = answerDirectlyFromContext(context, message);
  if (directReply) return avoidRepeatedReply(directReply, messages);

  const tenant = await requireTenantContext().catch(() => null);
  const runtime = tenant
    ? await resolveOpenAIResponsesRuntime({
        workspaceId: tenant.currentWorkspace.id,
        slot: "agent",
        fallbackModel: MODEL,
      })
    : { apiKey: process.env.OPENAI_API_KEY || "", model: MODEL, source: "env" as const };
  if (!runtime.apiKey) return fallbackAnswer(context, message, messages);

  try {
    const result = await callOpenAIResponses<Record<string, unknown>>({
      name: "social-agent-answer",
      apiKey: runtime.apiKey,
      body: {
        model: runtime.model,
        input: await buildPrompt(context, message, messages, pageContext, attachments),
      },
      tags: ["social-agent"],
      metadata: {
        endpoint: "POST /api/social-agent",
        pagePath: pageContext.path ?? null,
      },
    });

    const answer = extractResponseText(result.data) || fallbackAnswer(context, message, messages);
    if (tenant) {
      await recordTenantAuditEvent(tenant, {
        action: "llm.social_agent",
        targetType: "llm",
        metadata: {
          status: "success",
          endpoint: "POST /api/social-agent",
          model: runtime.model,
          modelSource: runtime.source,
          langsmithTrace: result.trace,
        },
      });
    }
    return avoidRepeatedReply(answer, messages);
  } catch {
    return fallbackAnswer(context, message, messages);
  }
}

async function buildPrompt(
  context: SocialAgentContext,
  message: string,
  messages: ChatMessage[],
  pageContext: ClientPageContext,
  attachments: SocialAgentAttachment[] = []
) {
  const modeInstruction = pageContext.productMode === "saas"
    ? "Mode: SaaS. Behave like a dashboard copilot: explain state and execute supported workspace-scoped chat actions when enough information is provided."
    : "Mode: Agentic. Behave like an AI social media manager: propose plans, draft next actions, and ask for approval before side effects.";
  const attachmentSummary = attachments.map((attachment) => ({
    url: attachment.url,
    name: attachment.name ?? null,
    contentType: attachment.contentType ?? null,
    size: attachment.size ?? null,
  }));
  const enrichedPageContext = await enrichPageContextWithArticle(pageContext);

  return `You are SMM Agent inside the SMM Agent dashboard.
${modeInstruction}
Answer based on sanitized workspace context below.
Do not reveal secrets, env values, access tokens, raw credential values, cookies, or API keys.
Do not mention internal ids, credential keys, credential counts, account id presence, auth method internals, or raw database field names.
The Replies page review stage is context.replies.review. It contains reply candidates whose status is new, analyzed, or drafted.
The Replies page Ready to Post stage is context.replies.ready. Recent posted reply activity is context.replies.postedRecent and context.replies.recentEvents.
If user asks about X, Twitter, review replies, or reply queue, answer from the replies context before recent posts.
Only say there are no review replies when context.summary.reviewReplyCount is 0.
Supported chat write actions already execute before this prompt when enough information is provided: RSS bulk removal except one kept source, support tickets, invitations, and recurring post schedule creation. If those actions are missing required information, ask only for the missing fields.
For recurring posts, ask for cadence, platform, and copy when missing. Attached images can be used as the schedule media URL; do not claim you inspected image pixels unless the user described them.
If an org admin asks to invite a teammate, tell them to use the exact command /invite email@example.com as viewer|client|contributor|editor|manager. Do not invent invite links or claim an invite was sent unless the command succeeds.
If user asks to report a bug, broken flow, failed connection, or support issue, tell them to use /support type | topic | explanation | image-url. Valid types are from_user_triage, from_bot, from_github_issue, and from_me. Do not claim a ticket exists unless the command succeeds.
If user asks for deployment, server logs, provider settings, raw token expiry, shell commands, database queries, production verification, source code, implementation details, or repo file paths, state that this dashboard chat cannot access those systems and bring them back to supported workspace actions.
Do not invent citations, statistics, sources, live links, or report names. If sources are not in the current article context or pasted by the user, ask for links or say you can draft without citations.
For ops requests, still provide available workspace data from context.schedules, context.pipelineRuns, and context.platforms before listing unavailable external systems.
Support command schema: /support source | topic | explanation | image-url. Source enum: from_user_triage, from_bot, from_github_issue, from_me. Topic and explanation are required. Image URL is optional. Campaign tags are not supported yet.
Hermes automation is ticket-to-PR follow-up, not immediate chat execution; it needs Linear configuration and ready-label triage outside this chatbot.
Keep answers short: 3 bullets maximum. Prefer one direct answer plus one next step. Do not restate the user's message.

Sanitized context:
${JSON.stringify(context)}

Current page:
${JSON.stringify(enrichedPageContext)}

Current message attachments:
${JSON.stringify(attachmentSummary)}

Recent chat:
${JSON.stringify(messages.slice(-8))}

User:
${message}`;
}

function fallbackAnswer(
  context: SocialAgentContext,
  message: string,
  messages: ChatMessage[] = []
) {
  const directReply = answerDirectlyFromContext(context, message);
  if (directReply) return avoidRepeatedReply(directReply, messages);

  const lowered = message.toLowerCase();

  if (lowered.includes("post") || lowered.includes("publish")) {
    return avoidRepeatedReply(
      "Send copy, target platform, media URL if any, and draft/publish/schedule.",
      messages
    );
  }

  if (lowered.includes("invite") || lowered.includes("team member")) {
    return avoidRepeatedReply(
      context.access.canInviteMembers
        ? "Invite format: `/invite email@example.com as viewer|client|contributor|editor|manager`."
        : "You can view this workspace, but inviting users requires org admin access.",
      messages
    );
  }

  if (
    lowered.includes("support") ||
    lowered.includes("bug") ||
    lowered.includes("broken") ||
    lowered.includes("not working")
  ) {
    return avoidRepeatedReply(
      "Support format: `/support from_user_triage | topic | explanation | image-url`.",
      messages
    );
  }

  return avoidRepeatedReply(
    "I can help with posts, replies, schedules, connections, articles, campaigns, invites, and support tickets.",
    messages
  );
}

function answerDirectlyFromContext(context: SocialAgentContext, message: string) {
  const lowered = message.toLowerCase();

  if (isClosingOrAcknowledgement(lowered)) {
    return "Sounds good. I can help when you are ready to connect accounts, draft posts, schedule content, review replies, or work on campaigns.";
  }

  const supportDraft = formatSupportDraftCommand(message);
  if (supportDraft) {
    return supportDraft;
  }

  if (isCitationRequest(lowered)) {
    return "I can’t fetch or verify live citations from this chat. Paste source links and I’ll integrate them; otherwise I can keep claims uncited/generic.";
  }

  if (isArticleEditingQuestion(lowered)) {
    return null;
  }

  if (isPendingInviteDetailsQuestion(lowered)) {
    return formatPendingInviteDetailsAnswer();
  }

  if (isConnectHowToQuestion(lowered)) {
    return "Connect accounts: left sidebar -> Platforms -> choose Twitter/X, Instagram, or another platform -> Connect/Reconnect. You need admin/posting permission on the social account.";
  }

  if (isSchedulingHowToQuestion(lowered)) {
    return formatSchedulingHowToAnswer(context, lowered);
  }

  if (isPlatformCapabilitiesQuestion(lowered)) {
    return "Supported targets include X/Twitter, LinkedIn, Instagram, Facebook, TikTok, and others shown in Platforms. You need account/page admin or posting permission to connect and publish.";
  }

  if (isInviteLimitQuestion(lowered)) {
    return "No: one `/invite` command per email. I can’t confirm a hard resend limit here; if an invite expires, send a fresh invite.";
  }

  if (isSupportPriorityQuestion(lowered)) {
    return "No automatic severity priority from chat. Put urgency in the topic/explanation so support can triage it.";
  }

  if (isInviteHowToQuestion(lowered)) {
    return formatInviteHowToAnswer(context);
  }

  if (isReplyDraftHelpQuestion(lowered)) {
    return formatReplyDraftHelpAnswer(context, lowered);
  }

  if (isPlatformsNavigationQuestion(lowered)) {
    return "Open Platforms from the left sidebar. If it is not visible, open Settings or the workspace menu and look for Platforms, Connections, or Integrations.";
  }

  if (isProfileNavigationQuestion(lowered)) {
    return "Create a profile from Profiles or Settings -> Profiles. Use business name, audience, tone, and default topics. One-off drafts can start before a profile; recurring schedules should use one.";
  }

  if (isSupportWorkflowQuestion(lowered)) {
    return formatSupportWorkflowAnswer(lowered);
  }

  if (isBackendOrOpsAuditQuestion(lowered)) {
    return formatBackendOrOpsBoundary(context, lowered);
  }

  if (isOnboardingQuestion(lowered)) {
    return formatOnboardingGuidance(context, lowered);
  }

  if (isInviteManagementQuestion(lowered)) {
    return formatInviteManagementAnswer(context, lowered);
  }

  if (isSettingsNavigationQuestion(lowered)) {
    return "Settings is the gear icon near the bottom of the left sidebar. If it is missing, use the avatar/workspace menu in the top right.";
  }

  if (isSocialOpsGuidanceQuestion(lowered)) {
    return formatSocialOpsGuidance(context, lowered);
  }

  if (isConnectionTroubleshootingQuestion(lowered)) {
    return formatConnectionGuidance(context, lowered);
  }

  if (isPostPublishStatusQuestion(message)) {
    return formatLatestPostPublishStatus(context);
  }

  if (isReplyQuestion(lowered)) {
    if (lowered.includes("ready")) {
      return formatReplyList("Ready to Post replies", filterReplyPlatform(context.replies.ready, lowered));
    }
    if (lowered.includes("posted") || lowered.includes("sent")) {
      return formatReplyList("Recently posted replies", filterReplyPlatform(context.replies.postedRecent, lowered));
    }
    return formatReplyList("Review replies", filterReplyPlatform(context.replies.review, lowered));
  }

  if (isConnectionSummaryQuestion(lowered)) {
    return summarizeContext(context);
  }

  if (isScheduleStatusQuestion(lowered)) {
    const enabledSchedules = context.schedules.filter((schedule) => schedule.enabled);
    return enabledSchedules.length
      ? `Enabled schedules: ${enabledSchedules
          .map((schedule) => `${schedule.name} on ${schedule.cron}`)
          .join("; ")}.`
      : "No enabled schedules in this workspace.";
  }

  return null;
}

function avoidRepeatedReply(reply: string, messages: ChatMessage[]) {
  const previousAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content?.trim();
  if (!previousAssistant || previousAssistant !== reply.trim()) return reply;

  return [
    "Same workspace state as above.",
    "Next: send the missing detail, paste text to draft, or choose a dashboard task.",
  ].join("\n");
}

function summarizeContext(context: SocialAgentContext) {
  const active = context.platforms
    .filter((platform) => platform.enabled)
    .map((platform) => `${platform.label}${platform.handle ? ` ${platform.handle}` : ""}`);
  const disabled = context.platforms
    .filter((platform) => !platform.enabled)
    .map((platform) => platform.label);
  const missing = context.missingPlatforms.map((platform) => platform.label);

  return [
    active.length ? `Connected/enabled: ${active.join(", ")}.` : "No connected or enabled platforms in this workspace.",
    disabled.length ? `Disabled: ${summarizeList(disabled, 4)}.` : "",
    missing.length ? `Not connected: ${summarizeList(missing, 6)}.` : "",
    "Next: open Platforms and connect the account you want to post from.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatOnboardingGuidance(
  context: SocialAgentContext,
  lowered: string
) {
  const hasPlatforms = context.summary.enabledPlatformCount > 0;
  const hasProfiles = context.summary.profileCount > 0;
  const lines: string[] = [];

  if (lowered.includes("magic link") || lowered.includes("invite")) {
    lines.push("Magic link: if you can see the dashboard, you are in. Expired usually means already used.");
  } else {
    lines.push("First step: sign in, then connect a platform.");
  }

  if (lowered.includes("how") && /\bconnect\b/.test(lowered)) {
    lines.push("Connect: left sidebar -> Platforms -> pick platform -> Connect/Reconnect.");
  } else if (lowered.includes("both") || lowered.includes("multiple") || lowered.includes("tiktok") || lowered.includes("linkedin")) {
    lines.push("Accounts are separate. Connecting TikTok will not change Instagram.");
  } else {
    lines.push("Invite access and social account connection are separate.");
  }

  lines.push(
    hasPlatforms
      ? "At least one platform is enabled here."
      : "No platform is enabled here yet."
  );

  if (!hasProfiles) {
    lines.push(lowered.includes("one-off") || lowered.includes("single post")
      ? "One-off drafts can start now; recurring schedules should use a profile."
      : "Profile: create one for recurring schedules.");
  }

  if (lowered.includes("disconnect")) {
    lines.push("Do not disconnect anything first unless the wrong account is already connected here.");
  }

  if (lowered.includes("stuck") || lowered.includes("worked") || lowered.includes("not sure")) {
    lines.push("If Connect says success but nothing appears, file `/support from_user_triage | Connection not saved | platform and expected vs actual |`.");
  }

  return lines.join("\n");
}

function formatConnectionGuidance(
  context: SocialAgentContext,
  lowered: string
) {
  const platform = findMentionedPlatform(context, lowered);
  const label = platform?.label ?? mentionedPlatformLabel(lowered) ?? "That platform";

  if (platform?.enabled) {
    return [
      `${label} is connected and enabled in this workspace.`,
      "If posting failed, check post target status and recent pipeline runs.",
    ].join("\n");
  }

  if (platform && !platform.enabled) {
    return [
      `${label} is connected but disabled in this workspace.`,
      "Enable it before scheduling or publishing.",
    ].join("\n");
  }

  return [
    `${label} is not connected in this workspace.`,
    "Open Platforms -> Connect/Reconnect before scheduling there.",
  ].join("\n");
}

function formatInviteManagementAnswer(
  context: SocialAgentContext,
  lowered: string
) {
  if (!context.access.canInviteMembers) {
    return "Invite management needs org admin access.";
  }
  if (/\bresend all pending\b/.test(lowered)) {
    return "Bulk resend is UI-only: Settings -> Users -> Pending invites -> Resend each row.";
  }
  if (lowered.includes("resend")) {
    const email = lowered.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    if (email) {
      return `To invite/resend ${email}, send role too: \`/invite ${email} as editor\`. UI resend: Settings -> Users -> Pending invites.`;
    }
    return "Resend: Settings -> Users -> Pending invites -> Resend. Chat invite needs email + role.";
  }
  const email = lowered.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  const role = WORKSPACE_ROLE_OPTIONS.find((option) => lowered.includes(option));
  if (email && role) {
    return `Use \`/invite ${email} as ${role}\`.`;
  }
  if (lowered.includes("revoke") || lowered.includes("remove")) {
    return "Revoke/remove: Settings -> Users or Team Members. Chat does not remove members.";
  }
  return "Use `/invite email@example.com as viewer|client|contributor|editor|manager`. Manage resend/revoke from Users.";
}

function formatInviteHowToAnswer(context: SocialAgentContext) {
  if (!context.access.canInviteMembers) return "Invite management needs org admin access.";
  return [
    "Invite: `/invite email@example.com as viewer|client|contributor|editor|manager`.",
    "Resend/revoke: Settings -> Users -> Pending invites or Team Members.",
    "Support: `/support from_user_triage | topic | explanation | image-url`.",
  ].join("\n");
}

function formatSchedulingHowToAnswer(context: SocialAgentContext, lowered: string) {
  if (/\brecurring|repeat|every monday|weekly|daily\b/.test(lowered)) {
    return [
      "Recurring: Schedules/Recurrent Posts -> New recurring post.",
      "Set cadence, e.g. every Monday at 10 AM, then choose target profiles/accounts.",
      "Captions can be edited later from the schedule detail.",
    ].join("\n");
  }

  const lines = [
    "Create: Posts or Scheduling -> New post -> Schedule.",
    "Targets: choose connected platform/account targets in the composer.",
    "Timezone: confirm the schedule timezone before saving.",
    "Monitor: Posts/Campaigns show scheduled, publishing, published, or failed per target.",
  ];

  if (!context.summary.enabledPlatformCount) {
    lines.unshift("No connected platform here yet; connect one first.");
  }

  if (/\bbulk\b/.test(lowered)) {
    lines.push("Bulk caption edit is not in chat yet; edit scheduled posts one by one.");
  }

  return lines.join("\n");
}

function formatReplyDraftHelpAnswer(context: SocialAgentContext, lowered: string) {
  const replies = lowered.includes("posted") || lowered.includes("recent")
    ? context.replies.postedRecent
    : [...context.replies.review, ...context.replies.ready];
  if (!replies.length) {
    if (/\bdraft\b/.test(lowered) && /\b(options?|3|three)\b/.test(lowered)) {
      return [
        "1. Thank you for the feedback. We’re grateful to have you in this community.",
        "2. Thanks for sharing this. Your feedback helps us keep improving.",
        "3. Thank you. We appreciate the support and the ideas from this community.",
      ].join("\n");
    }
    return "No reply candidates are available right now. Paste reply text plus tone, and I’ll draft an improved version without posting.";
  }
  return formatReplyList("Reply candidates", filterReplyPlatform(replies, lowered));
}

function formatSocialOpsGuidance(context: SocialAgentContext, lowered: string) {
  const lines = [
    summarizeContext(context),
    context.summary.profileCount
      ? "Profiles: profile exists for drafting/schedules."
      : "Profiles: none yet; create one before recurring schedules.",
  ];

  if (/\bbulk\b/.test(lowered)) {
    lines.push("Bulk edit is not in chat yet; edit scheduled posts one by one.");
  }

  if (/\btimezone|time zone|utc|est\b/.test(lowered)) {
    lines.push("Timezone: compare workspace/profile timezone with the schedule detail.");
  }

  if (/\bpermission|test post|posting rights\b/.test(lowered)) {
    lines.push("Permissions: use platform Test/Reconnect controls if available.");
  }

  if (/\blifecycle|failed vs queued|error visibility\b/.test(lowered)) {
    lines.push("Lifecycle: draft/scheduled -> publishing -> published or failed.");
  }

  if (/\bpost_targets|platform targets?\b/.test(lowered)) {
    lines.push("Targets: post detail shows account, creative, status, and target error.");
  }

  return lines.join("\n");
}

function isOnboardingQuestion(lowered: string) {
  return (
    /\b(first step|get started|where to begin|onboarding|magic link|invite thing|accept.*invite)\b/.test(lowered) ||
    (/\bconnect(ed|ing)?\b/.test(lowered) && /\b(schedule|scheduling|posts?)\b/.test(lowered) && /\b(before|after|first|begin)\b/.test(lowered))
  );
}

function isInviteManagementQuestion(lowered: string) {
  return (
    /\b(resend|revoke|remove user|user access|team member|pending invites?)\b/.test(lowered) ||
    (/\binvite\b/.test(lowered) && /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(lowered))
  );
}

function isInviteHowToQuestion(lowered: string) {
  return /\binvite\b/.test(lowered) &&
    /\b(how|steps|teammates?|resend|revoke|clear|quick)\b/.test(lowered);
}

function isPendingInviteDetailsQuestion(lowered: string) {
  return /\b(pending invites?|from_user_triage|allowed values?|revoke access|team members?)\b/.test(lowered) &&
    /\b(where|exact|tab|filter|values?|means?|revoke|remove|confirm)\b/.test(lowered);
}

function formatPendingInviteDetailsAnswer() {
  return [
    "Pending invites: Settings -> Users -> Pending invites/Invites tab. If no tab exists, there are no pending invites visible.",
    "`/support` source values: `from_user_triage`, `from_bot`, `from_github_issue`, `from_me`.",
    "Revoke: Settings -> Users/Team Members -> remove member. That removes workspace access.",
  ].join("\n");
}

function isConnectHowToQuestion(lowered: string) {
  return /\b(connect|reconnect|link|linked)\b/.test(lowered) &&
    /\b(twitter|x|instagram|ig|linkedin|facebook|tiktok|platform|account)\b/.test(lowered);
}

function isInviteLimitQuestion(lowered: string) {
  return /\binvite/.test(lowered) &&
    /\b(multiple|bulk|one command|one email|resend limit|limit|expires?|invalid)\b/.test(lowered);
}

function isSupportPriorityQuestion(lowered: string) {
  return /\bsupport\b/.test(lowered) &&
    /\b(priority|prioritized|severity|urgent|triage)\b/.test(lowered);
}

function isPlatformCapabilitiesQuestion(lowered: string) {
  return /\b(platform|account|connect)\b/.test(lowered) &&
    /\b(types?|which|specific|support|admin|permission|permissions)\b/.test(lowered);
}

function isCitationRequest(lowered: string) {
  return /\b(citation|citations|sources?|live links?|report|statistics|stats)\b/.test(lowered) &&
    /\b(exact|up-to-date|attach|include|cite|link|verify)\b/.test(lowered);
}

function isClosingOrAcknowledgement(lowered: string) {
  return /\b(thanks|thank you|got it|perfect|sounds good|appreciate|that helps)\b/.test(lowered) &&
    !/[?]/.test(lowered) &&
    !/\b(draft|create|schedule|invite|support|connect|where|how|what|show|help me)\b/.test(lowered);
}

function formatSupportDraftCommand(message: string) {
  if (!isSupportDraftRequest(message.toLowerCase())) {
    return null;
  }

  const ticket = parseLabeledSupportTicket(message);
  if (!ticket) return null;

  return [
    "Use this command:",
    `/support ${ticket.source} | ${ticket.topic} | ${ticket.explanation} | ${ticket.imageUrl ?? ""}`,
  ].join("\n");
}

function isSupportDraftRequest(lowered: string) {
  return /\b(format|draft|prepare)\b/.test(lowered) &&
    /\/support|support ticket/.test(lowered);
}

function isSchedulingHowToQuestion(lowered: string) {
  return /\b(schedule|scheduling|scheduled post|composer|post_targets|audience|timezone|time zone|media|creative)\b/.test(lowered) &&
    /\b(where|how|can i|confirm|select|set|upload|target|go to)\b/.test(lowered);
}

function isReplyDraftHelpQuestion(lowered: string) {
  return /\brepl(?:y|ies)\b/.test(lowered) &&
    /\b(draft|improve|warmer|rewrite|review|recent|enhance)\b/.test(lowered);
}

function isArticleEditingQuestion(lowered: string) {
  return /\b(article|intro|introduction|section|revise|rewrite|improve|linkedin|x post|social post|campaign angle)\b/.test(lowered) &&
    /\b(paste|here is|revise|rewrite|improve|draft|make it|tone|cta|article)\b/.test(lowered);
}

function isSettingsNavigationQuestion(lowered: string) {
  return /\bsettings\b/.test(lowered) && /\b(where exactly|gear|avatar|sidebar)\b/.test(lowered);
}

function isPlatformsNavigationQuestion(lowered: string) {
  return /\b(platforms?|connections?|integrations?)\b/.test(lowered) &&
    /\b(where|find|located|section|tab|menu|reconnect|connect)\b/.test(lowered);
}

function isProfileNavigationQuestion(lowered: string) {
  return /\b(profile|persona)\b/.test(lowered) &&
    /\b(where|find|create|make|one-off|single post|skip)\b/.test(lowered);
}

function isSupportWorkflowQuestion(lowered: string) {
  return /\b(support ticket|\/support|autorepair|ready for hermes|linear labels?|ticket payload|failed invite|invite delivery)\b/.test(lowered) &&
    !/\b(api route|source code|repo|schema|webhook payload|validation logic|config excerpt|file path)\b/.test(lowered);
}

function formatSupportWorkflowAnswer(lowered: string) {
  const lines = [
    "Use `/support from_user_triage | topic | explanation | image-url` for user-visible issues.",
  ];

  if (/\bautorepair|ready for hermes|linear labels?\b/.test(lowered)) {
    lines.push("Do not add internal flags manually. Put the real user problem in the explanation; automation/labels are handled outside this chat.");
  }

  if (/\bfailed invite|invite delivery|auth\b/.test(lowered)) {
    lines.push("Keep invite delivery and access/auth issues separate: delivery means resend/check email; access means role, workspace, or sign-in problem.");
  }

  lines.push("Include expected result, actual result, workspace/client, platform if relevant, and screenshot URL if you have one.");
  return lines.join("\n");
}

function isSocialOpsGuidanceQuestion(lowered: string) {
  if (isBackendOrOpsAuditQuestion(lowered)) return false;
  return /\b(overview|consolidated|permission|test post|posting rights|timezone|time zone|lifecycle|error visibility|failed vs queued|bulk edit|bulk enabling|post_targets|platform targets?)\b/.test(lowered);
}

function isConnectionTroubleshootingQuestion(lowered: string) {
  if (isBackendOrOpsAuditQuestion(lowered)) return false;
  return /\b(unlinked|linked|re-?auth|auth|oauth|token|session health|connection health|not connected|connect(ed|ion)? failed|posts? are not going through)\b/.test(lowered);
}

function isConnectionSummaryQuestion(lowered: string) {
  return /\b(connected|connection|active platforms?|social accounts?)\b/.test(lowered);
}

function isScheduleStatusQuestion(lowered: string) {
  if (isBackendOrOpsAuditQuestion(lowered)) return false;
  return /\b(list|show|what|which|enabled|active|status)\b.*\bschedules?\b/.test(lowered) ||
    /\bschedules?\b.*\b(list|show|enabled|active|status)\b/.test(lowered);
}

function isBackendOrOpsAuditQuestion(lowered: string) {
  if (/\bhermes\b/.test(lowered) && /\b(ticket|payload|pr|pull request|linear|autorepair|ready)\b/.test(lowered)) {
    return true;
  }

  const asksBackend =
    /\b(webhook|payload|json schema|api route|api endpoint|linear|hermes|autorepair|logs?|container|systemd|coolify|contabo|docker|deploy|cron|database|sql|env(?:ironment)? variable|raw output|audit|config file|shell command|source code|repo|file path|implementation)\b/.test(lowered);
  const asksActionOrEvidence =
    /\b(list|detail|dump|extract|show|provide|confirm|compare|deploy|execute|audit|schema|failure points?|timestamps?|last 24 hours|last 30 days)\b/.test(lowered);

  return asksBackend && asksActionOrEvidence;
}

function formatBackendOrOpsBoundary(context: SocialAgentContext, lowered: string) {
  const lines = [
    "I can’t access deployments, host logs, env vars, raw database rows, provider dashboards, source code, or repo files from this dashboard chat.",
  ];

  if (lowered.includes("/support") || lowered.includes("support")) {
    lines.push("For a user-visible issue, use `/support from_user_triage | topic | explanation | image-url`.");
  }

  if (lowered.includes("invite")) {
    lines.push("Invite help I can do: create an invite command, explain resend/revoke, or separate delivery vs access issues.");
  }

  if (lowered.includes("cron") || lowered.includes("schedule")) {
    lines.push(context.schedules.length ? `Visible schedules: ${context.schedules.map((schedule) => `${schedule.name} ${schedule.cron}`).join("; ")}.` : "Visible schedules: none in this workspace.");
  }

  lines.push("I can help here with posts, replies, schedules, connections, articles, campaigns, and workspace status.");

  return lines.join("\n");
}

function findMentionedPlatform(context: SocialAgentContext, lowered: string) {
  return context.platforms.find((platform) => {
    const values = [
      platform.type,
      platform.label,
      platform.name,
      platform.handle ?? "",
      platform.type === "twitter" || platform.type === "x" ? "x twitter" : "",
    ];
    return values.some((value) => {
      const normalized = normalizeSearchText(value);
      return normalized && lowered.includes(normalized);
    });
  });
}

function mentionedPlatformLabel(lowered: string) {
  if (/\b(facebook|fb)\b/.test(lowered)) return "Facebook";
  if (/\b(instagram|ig)\b/.test(lowered)) return "Instagram";
  if (/\b(tiktok|tik tok)\b/.test(lowered)) return "TikTok";
  if (/\b(linkedin)\b/.test(lowered)) return "LinkedIn";
  if (/\b(twitter|x\/twitter)\b/.test(lowered) || /\bx\b/.test(lowered)) return "Twitter/X";
  if (/\b(threads)\b/.test(lowered)) return "Threads";
  if (/\b(bluesky)\b/.test(lowered)) return "Bluesky";
  if (/\b(reddit)\b/.test(lowered)) return "Reddit";
  return null;
}

function summarizeList(values: string[], limit: number) {
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} and ${values.length - limit} more`;
}

function extractResponseText(body: Record<string, unknown>) {
  const outputText = body.output_text;
  if (typeof outputText === "string") return outputText.trim();

  const output = Array.isArray(body.output)
    ? (body.output as Array<Record<string, unknown>>)
    : [];
  for (const block of output) {
    const content = Array.isArray(block.content)
      ? (block.content as Array<Record<string, unknown>>)
      : [];
    for (const item of content) {
      if (typeof item.text === "string") return item.text.trim();
    }
  }

  return "";
}

function sanitizePageContext(value: ClientPageContext | undefined): ClientPageContext {
  const article = sanitizeArticlePageContext(value?.article);

  return {
    path: sanitizeShortText(value?.path, 120),
    title: sanitizeShortText(value?.title, 160),
    heading: sanitizeShortText(value?.heading, 120),
    article,
    productMode: parseProductMode(value?.productMode),
    replyLanguage:
      value?.replyLanguage === "any" || value?.replyLanguage === "en"
        ? value.replyLanguage
        : null,
  };
}

function sanitizeArticlePageContext(
  value: ClientPageContext["article"] | undefined
): ClientPageContext["article"] {
  if (!value) return null;
  return {
    articleId: sanitizeShortText(value.articleId ?? undefined, 80) ?? null,
    openRef: sanitizeShortText(value.openRef ?? undefined, 500) ?? null,
    visibleTitle: sanitizeShortText(value.visibleTitle ?? undefined, 180) ?? null,
    visiblePath: sanitizeShortText(value.visiblePath ?? undefined, 240) ?? null,
  };
}

async function enrichPageContextWithArticle(
  pageContext: ClientPageContext
): Promise<ClientPageContext> {
  if (!pageContext.article) return pageContext;

  const currentArticle =
    (await loadCurrentDbArticle(pageContext.article.articleId)) ??
    (await loadCurrentFilesystemArticle(pageContext.article.openRef));

  return {
    ...pageContext,
    currentArticle,
  };
}

async function loadCurrentDbArticle(articleId?: string | null) {
  if (!articleId) return null;
  const [article] = await db
    .select({
      title: blogAutomationPosts.title,
      status: blogAutomationPosts.status,
      validationStatus: blogAutomationPosts.validationStatus,
      validationScore: blogAutomationPosts.validationScore,
      excerpt: blogAutomationPosts.excerpt,
      contentMarkdown: blogAutomationPosts.contentMarkdown,
      sources: blogAutomationPosts.sources,
    })
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.id, articleId))
    .limit(1);

  if (!article) return null;
  return {
    source: "db" as const,
    title: article.title,
    status: article.status,
    validation: `${article.validationStatus} ${article.validationScore}/110`,
    excerpt: truncateText(article.excerpt, 500),
    contentPreview: truncateText(article.contentMarkdown, 4000),
    sources: (article.sources ?? []).slice(0, 8).map((source) => ({
      title: source.title ?? null,
      url: source.url,
    })),
  };
}

async function loadCurrentFilesystemArticle(openRef?: string | null) {
  if (!openRef) return null;
  const preview = await getArticleWorkspacePreview(openRef).catch(() => null);
  if (!preview || !preview.exists) return null;

  return {
    source: "filesystem" as const,
    title: preview.relativePath || preview.label,
    path: preview.relativePath || preview.root,
    status: preview.kind,
    contentPreview: preview.text ? truncateText(preview.text, 4000) : null,
  };
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`
    : normalized;
}

function sanitizeShortText(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function isHttpUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isReplyQuestion(lowered: string) {
  return (
    lowered.includes("reply") ||
    lowered.includes("replies") ||
    lowered.includes("review queue") ||
    lowered.includes("ready to post")
  );
}

function filterReplyPlatform(
  replies: SocialAgentContext["replies"]["review"],
  lowered: string
) {
  if (
    lowered.includes(" x") ||
    lowered.includes("x?") ||
    lowered.includes("twitter")
  ) {
    return replies.filter(
      (reply) => reply.platformType === "twitter" || reply.platformType === "x"
    );
  }
  return replies;
}

function formatReplyList(
  label: string,
  replies: SocialAgentContext["replies"]["review"]
) {
  if (!replies.length) return `No ${label.toLowerCase()} right now.`;

  return `${label}:\n${replies
    .slice(0, 5)
    .map((reply, index) => {
      const draft = reply.selectedDraft ? ` Draft: ${reply.selectedDraft}` : "";
      return `${index + 1}. ${reply.author}: ${reply.text} Score ${reply.score}.${draft}`;
    })
    .join("\n")}`;
}
