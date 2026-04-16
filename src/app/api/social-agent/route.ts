import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  loadSocialAgentContext,
  type SocialAgentContext,
} from "@/lib/social-agent/context";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL =
  process.env.OPENAI_SOCIAL_AGENT_MODEL ||
  process.env.OPENAI_REPLY_MODEL ||
  "gpt-5-mini";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ClientPageContext = {
  path?: string;
  title?: string;
  heading?: string;
  replyLanguage?: string | null;
};

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
      "How can I help?\n\nI can make a post, check connected accounts, or explain what we can do with this workspace.",
  });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    messages?: ChatMessage[];
    pageContext?: ClientPageContext;
  };
  const message = String(body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const pageContext = sanitizePageContext(body.pageContext);
  const context = await loadSocialAgentContext({
    replyLanguage: pageContext.replyLanguage,
  });
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const reply = await answerWithContext(context, message, messages, pageContext);
  return NextResponse.json({ context, reply });
}

async function answerWithContext(
  context: SocialAgentContext,
  message: string,
  messages: ChatMessage[],
  pageContext: ClientPageContext
) {
  const directReply = answerDirectlyFromContext(context, message);
  if (directReply) return directReply;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackAnswer(context, message);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: buildPrompt(context, message, messages, pageContext),
      }),
    });

    if (!response.ok) return fallbackAnswer(context, message);
    const body = (await response.json()) as Record<string, unknown>;
    return extractResponseText(body) || fallbackAnswer(context, message);
  } catch {
    return fallbackAnswer(context, message);
  }
}

function buildPrompt(
  context: SocialAgentContext,
  message: string,
  messages: ChatMessage[],
  pageContext: ClientPageContext
) {
  return `You are Social Agent inside the social-poster dashboard.
Answer based on sanitized workspace DB and code context below.
Do not reveal secrets, env values, access tokens, raw credential values, cookies, or API keys.
Do not mention internal ids, credential keys, credential counts, account id presence, auth method internals, or raw database field names.
The Replies page review stage is context.replies.review. It contains reply candidates whose status is new, analyzed, or drafted.
The Replies page Ready to Post stage is context.replies.ready. Recent posted reply activity is context.replies.postedRecent and context.replies.recentEvents.
If user asks about X, Twitter, review replies, or reply queue, answer from the replies context before recent posts.
Only say there are no review replies when context.summary.reviewReplyCount is 0.
If user asks to post or schedule, ask for missing platform, copy, media URL, and time. Mention the API route but do not pretend an action already happened.
Keep answers concise and operational.

Sanitized context:
${JSON.stringify(context)}

Current page:
${JSON.stringify(pageContext)}

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

  return "I can answer from workspace social accounts, replies, posts, schedules, pipeline runs, RSS setup, and safe API context. Ask what is connected, what needs review, or what can publish.";
}

function answerDirectlyFromContext(context: SocialAgentContext, message: string) {
  const lowered = message.toLowerCase();

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
