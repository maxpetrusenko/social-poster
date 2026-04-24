import crypto from "node:crypto";
import cron from "node-cron";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms, profiles, rssSources, schedules } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { requireApiSession } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { sendWorkspaceInvitationEmail } from "@/lib/mail";
import {
  loadSocialAgentContext,
  type SocialAgentContext,
} from "@/lib/social-agent/context";
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
      const message =
        error instanceof Error ? error.message : "Support ticket could not be created.";
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
  if (!/^\/support\b/i.test(normalized)) return null;

  const raw = normalized.replace(/^\/support\b/i, "").trim();
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
  const asksForTicket =
    lowered.includes("open ticket") ||
    lowered.includes("create ticket") ||
    lowered.includes("make ticket") ||
    lowered.includes("support ticket") ||
    lowered.includes("file ticket") ||
    lowered.includes("report issue");
  if (!asksForTicket) return null;

  const looksLikeIssue =
    lowered.includes("failed") ||
    lowered.includes("error") ||
    lowered.includes("can't") ||
    lowered.includes("cannot") ||
    lowered.includes("not working") ||
    lowered.includes("broken") ||
    lowered.includes("connect");
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

async function answerWithContext(
  context: SocialAgentContext,
  message: string,
  messages: ChatMessage[],
  pageContext: ClientPageContext,
  attachments: SocialAgentAttachment[] = []
) {
  const directReply = answerDirectlyFromContext(context, message);
  if (directReply) return directReply;

  const tenant = await requireTenantContext().catch(() => null);
  const runtime = tenant
    ? await resolveOpenAIResponsesRuntime({
        workspaceId: tenant.currentWorkspace.id,
        slot: "agent",
        fallbackModel: MODEL,
      })
    : { apiKey: process.env.OPENAI_API_KEY || "", model: MODEL, source: "env" as const };
  if (!runtime.apiKey) return fallbackAnswer(context, message);

  try {
    const result = await callOpenAIResponses<Record<string, unknown>>({
      name: "social-agent-answer",
      apiKey: runtime.apiKey,
      body: {
        model: runtime.model,
        input: buildPrompt(context, message, messages, pageContext, attachments),
      },
      tags: ["social-agent"],
      metadata: {
        endpoint: "POST /api/social-agent",
        pagePath: pageContext.path ?? null,
      },
    });

    const answer = extractResponseText(result.data) || fallbackAnswer(context, message);
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
    return answer;
  } catch {
    return fallbackAnswer(context, message);
  }
}

function buildPrompt(
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

  return `You are SMM Agent inside the SMM Agent dashboard.
${modeInstruction}
Answer based on sanitized workspace DB and code context below.
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
Keep answers concise and operational.

Sanitized context:
${JSON.stringify(context)}

Current page:
${JSON.stringify(pageContext)}

Current message attachments:
${JSON.stringify(attachmentSummary)}

Recent chat:
${JSON.stringify(messages.slice(-8))}

User:
${message}`;
}

function fallbackAnswer(context: SocialAgentContext, message: string) {
  const directReply = answerDirectlyFromContext(context, message);
  if (directReply) return directReply;

  const lowered = message.toLowerCase();

  if (lowered.includes("post") || lowered.includes("publish")) {
    return "I can help draft a post and check targets. Tell me copy, desired platforms, media URL if needed, and whether this is draft, publish now, or scheduled.";
  }

  if (lowered.includes("invite") || lowered.includes("team member")) {
    return context.access.canInviteMembers
      ? "Use `/invite email@example.com as viewer|client|contributor|editor|manager` to invite someone to the current workspace."
      : "You can view this workspace, but inviting users requires org admin access.";
  }

  if (
    lowered.includes("support") ||
    lowered.includes("bug") ||
    lowered.includes("broken") ||
    lowered.includes("not working")
  ) {
    return "Use `/support from_user_triage | topic | explanation | image-url` to create a Linear ticket. Use `from_bot` when the agent should route it to the repair flow. Image URL is optional.";
  }

  return "I can answer from workspace social accounts, replies, posts, schedules, pipeline runs, RSS setup, and safe API context. Ask what is connected, what needs review, or what can publish.";
}

function answerDirectlyFromContext(context: SocialAgentContext, message: string) {
  const lowered = message.toLowerCase();

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

  if (lowered.includes("connected") || lowered.includes("connection")) {
    return summarizeContext(context);
  }

  if (lowered.includes("schedule")) {
    const enabledSchedules = context.schedules.filter((schedule) => schedule.enabled);
    return enabledSchedules.length
      ? `Enabled schedules: ${enabledSchedules
          .map((schedule) => `${schedule.name} on ${schedule.cron}`)
          .join("; ")}.`
      : "No enabled schedules in this workspace.";
  }

  return null;
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
    active.length ? `Active: ${active.join(", ")}.` : "No active platforms.",
    disabled.length ? `Disabled: ${disabled.join(", ")}.` : "",
    missing.length ? `Not connected: ${missing.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  return {
    path: sanitizeShortText(value?.path, 120),
    title: sanitizeShortText(value?.title, 160),
    heading: sanitizeShortText(value?.heading, 120),
    productMode: parseProductMode(value?.productMode),
    replyLanguage:
      value?.replyLanguage === "any" || value?.replyLanguage === "en"
        ? value.replyLanguage
        : null,
  };
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
