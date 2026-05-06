export type SocialAgentAttachment = {
  url: string;
  name?: string;
  contentType?: string;
  size?: number;
};

export type RssKeepIntent = {
  kind: "rss_keep_only";
  keepQuery: string | null;
};

export type RecurringPostIntent = {
  kind: "recurring_post_create";
  cron: string | null;
  cronHuman: string | null;
  content: string | null;
  platformQuery: string | null;
  name: string | null;
  mediaUrl: string | null;
};

const WEEKDAY_BY_NAME: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

export function sanitizeSocialAgentAttachments(value: unknown): SocialAgentAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SocialAgentAttachment | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      if (!isHttpUrl(url)) return null;

      const contentType =
        typeof record.contentType === "string" ? record.contentType.trim() : undefined;
      const name = typeof record.name === "string" ? record.name.trim().slice(0, 120) : undefined;
      const size =
        typeof record.size === "number" && Number.isFinite(record.size)
          ? Math.max(0, Math.round(record.size))
          : undefined;

      const attachment: SocialAgentAttachment = { url };
      if (name) attachment.name = name;
      if (contentType) attachment.contentType = contentType;
      if (size !== undefined) attachment.size = size;
      return attachment;
    })
    .filter((item): item is SocialAgentAttachment => item !== null)
    .slice(0, 4);
}

export function parseRssKeepIntent(message: string): RssKeepIntent | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  const lowered = normalized.toLowerCase();

  if (!/\brss\b/.test(lowered)) return null;
  if (!/\b(remove|delete|clear)\b/.test(lowered)) return null;
  if (!/\b(all|every|rest)\b/.test(lowered)) return null;
  if (!/\b(but|except|keep)\b/.test(lowered)) return null;

  const keepMatch =
    normalized.match(/\b(?:but|except)\s+(?:keep\s+)?(?:the\s+)?(.+)$/i) ??
    normalized.match(/\bkeep\s+(?:only\s+)?(?:the\s+)?(.+)$/i);
  const rawKeepQuery = keepMatch?.[1]?.trim().replace(/[.!?]+$/g, "") ?? "";
  const keepQuery = normalizeKeepQuery(rawKeepQuery);

  return {
    kind: "rss_keep_only",
    keepQuery,
  };
}

export function parseRecurringPostIntent(
  message: string,
  attachments: SocialAgentAttachment[] = []
): RecurringPostIntent | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  const lowered = normalized.toLowerCase();

  if (isRecurringPostDiagnostic(lowered)) return null;
  if (isUncommittedRecurringQuestion(lowered)) return null;
  if (/\b(create|make|set up|setup)\s+(?:a\s+)?profile\b/.test(lowered)) return null;

  const wantsCreate =
    /\b(create|make|add|start|set up|setup|schedule)\b/.test(lowered);
  const wantsRecurring =
    /\b(recurring|recurrent|repeat|repeating|daily|weekly|weekday|weekdays|every day|each day|every weekday|every (?:sun|mon|tue|tues|wed|thu|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)|every \d{1,2} hours?|cron)\b/.test(lowered);
  const wantsPost = /\b(post|posts|caption|content)\b/.test(lowered);
  if (!wantsCreate || !wantsRecurring || !wantsPost) return null;

  const cronParts = inferCron(normalized);
  const content = extractPostContent(normalized);
  const name = extractNamedValue(normalized);
  const platformQuery = extractPlatformQuery(normalized);
  const mediaUrl = explicitMediaUrl(normalized) ?? attachments.find(isImageAttachment)?.url ?? null;

  return {
    kind: "recurring_post_create",
    cron: cronParts?.cron ?? null,
    cronHuman: cronParts?.human ?? null,
    content,
    platformQuery,
    name,
    mediaUrl,
  };
}

function isRecurringPostDiagnostic(lowered: string) {
  if (/\b(post status|publish status|published status|failed vs queued|failed or queued|queued and delayed)\b/.test(lowered)) {
    return true;
  }
  if (/\b(token|auth|oauth|session|connection|connect|linked|unlinked|logs?|error feed|health)\b/.test(lowered)) {
    return true;
  }
  if (/\b(cron schedule entries|cron entries|posting frequency|post-history|schema|migration|coolify|contabo|hermes|linear)\b/.test(lowered)) {
    return true;
  }
  return false;
}

function isUncommittedRecurringQuestion(lowered: string) {
  return (
    /\b(can i|can also|should i|do i need|what if|not ready|don't start|do not start|maybe|or no|or should|would you like|ready)\b/.test(lowered) &&
    /\b(recurring|schedule|scheduling|post|posts)\b/.test(lowered)
  );
}

function normalizeKeepQuery(value: string) {
  const trimmed = value
    .replace(/^rss\s+(?:source|feed|account|acc)\s+/i, "")
    .replace(/^(?:source|feed|account|acc)\s+/i, "")
    .trim();
  if (!trimmed) return null;
  if (/^(?:1|one|single|a single one|only one)$/i.test(trimmed)) return null;
  return trimmed;
}

function inferCron(message: string): { cron: string; human: string } | null {
  const explicit = message.match(
    /\b(\*|[0-5]?\d|\*\/\d+)\s+(\*|[01]?\d|2[0-3]|\*\/\d+)\s+(\*|[1-9]|[12]\d|3[01])\s+(\*|[1-9]|1[0-2])\s+(\*|[0-7]|[0-7](?:-[0-7])?)\b/
  );
  if (explicit) {
    return { cron: explicit[0], human: `Cron ${explicit[0]}` };
  }

  const everyHours = message.match(/\bevery\s+(\d{1,2})\s+hours?\b/i);
  if (everyHours) {
    const hours = Number(everyHours[1]);
    if (Number.isInteger(hours) && hours >= 1 && hours <= 23) {
      return { cron: `0 */${hours} * * *`, human: `Every ${hours} hours` };
    }
  }

  const time = parseTime(message) ?? { hour: 9, minute: 0, label: "9 AM" };
  const weekday = Object.entries(WEEKDAY_BY_NAME).find(([name]) =>
    new RegExp(`\\bevery\\s+${name}\\b`, "i").test(message)
  );
  if (weekday) {
    const day = weekday[1];
    const label = titleCase(weekday[0]);
    return {
      cron: `${time.minute} ${time.hour} * * ${day}`,
      human: `Every ${label} at ${time.label}`,
    };
  }

  if (/\b(weekdays|weekday|every weekday)\b/i.test(message)) {
    return {
      cron: `${time.minute} ${time.hour} * * 1-5`,
      human: `Every weekday at ${time.label}`,
    };
  }

  if (/\b(daily|every day|each day)\b/i.test(message)) {
    return {
      cron: `${time.minute} ${time.hour} * * *`,
      human: `Every day at ${time.label}`,
    };
  }

  return null;
}

function parseTime(message: string) {
  const match = message.match(/\bat\s+([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3]?.toLowerCase();
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return {
    hour,
    minute,
    label: `${hourLabel(hour, minute, period)}`,
  };
}

function extractPostContent(message: string) {
  const colonIndex = message.indexOf(":");
  if (colonIndex >= 0) {
    const content = message.slice(colonIndex + 1).trim();
    if (content) return content.slice(0, 5000);
  }

  const quoted = message.match(/["“]([^"”]{1,5000})["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  return null;
}

function extractNamedValue(message: string) {
  const match = message.match(/\bnamed\s+["“]?([^"”]+?)["”]?(?:\s+(?:every|daily|weekday|on|to|at|with)|$)/i);
  return match?.[1]?.trim().slice(0, 140) || null;
}

function extractPlatformQuery(message: string) {
  const match = message.match(/\b(?:on|to)\s+([a-z0-9@, /+.-]+?)(?:\s+(?:every|daily|weekday|at|with|using|named)|:|$)/i);
  const value = match?.[1]?.trim();
  if (!value) return null;
  if (/^(?:rss|schedule|post|posts)$/i.test(value)) return null;
  return value.slice(0, 160);
}

function explicitMediaUrl(message: string) {
  const match = message.match(/\b(?:image|media|photo|picture)\s+(https?:\/\/[^\s)]+)/i);
  return match?.[1]?.replace(/[.,!?]+$/g, "") ?? null;
}

function isImageAttachment(attachment: SocialAgentAttachment) {
  return !attachment.contentType || attachment.contentType.startsWith("image/");
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}

function hourLabel(hour: number, minute: number, explicitPeriod?: string) {
  if (explicitPeriod) {
    const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelveHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${explicitPeriod.toUpperCase()}`;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
