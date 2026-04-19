import "server-only";

export const SUPPORT_TICKET_SOURCES = [
  "from_user_triage",
  "from_bot",
  "from_github_issue",
  "from_me",
] as const;

export type SupportTicketSource = (typeof SUPPORT_TICKET_SOURCES)[number];

export const SUPPORT_TICKET_SOURCE_LABELS: Record<SupportTicketSource, string> = {
  from_user_triage: "User triage",
  from_bot: "Bot",
  from_github_issue: "GitHub issue",
  from_me: "Max",
};

type LinearGraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type LinearProject = {
  id: string;
  name: string;
  teams?: {
    nodes?: Array<{ id: string; key?: string | null; name?: string | null }>;
  } | null;
};

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
};

type RepairAgentStatus =
  | { status: "skipped"; reason: string }
  | { status: "not_configured"; reason: string }
  | { status: "sent"; host: string }
  | { status: "failed"; reason: string };

export type CreateSupportTicketInput = {
  source: SupportTicketSource;
  topic: string;
  explanation: string;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  pageTitle?: string | null;
  autoRepair?: boolean;
  reporter?: {
    email?: string | null;
    name?: string | null;
    userId?: string | null;
  } | null;
  workspace?: {
    id?: string | null;
    name?: string | null;
    organizationName?: string | null;
  } | null;
};

export type CreateSupportTicketResult = {
  issue: LinearIssue;
  repairAgent: RepairAgentStatus;
};

type LinearTarget = {
  apiKey: string;
  teamId: string;
  projectId?: string | null;
  projectName?: string | null;
};

const DEFAULT_PROJECT_NAME = "clawPoster";

export function normalizeSupportTicketSource(
  value: unknown,
  fallback: SupportTicketSource = "from_user_triage"
): SupportTicketSource {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return SUPPORT_TICKET_SOURCES.includes(normalized as SupportTicketSource)
    ? (normalized as SupportTicketSource)
    : fallback;
}

export function isSupportTicketSource(value: string): value is SupportTicketSource {
  return SUPPORT_TICKET_SOURCES.includes(value as SupportTicketSource);
}

export async function createSupportTicket(
  input: CreateSupportTicketInput
): Promise<CreateSupportTicketResult> {
  const target = await resolveLinearTarget();
  const title = buildIssueTitle(input);
  const description = buildIssueDescription(input, target);

  const labelIds = parseCsv(process.env.LINEAR_SUPPORT_LABEL_IDS);
  const createInput: Record<string, unknown> = {
    title,
    description,
    teamId: target.teamId,
  };
  if (target.projectId) createInput.projectId = target.projectId;
  if (labelIds.length > 0) createInput.labelIds = labelIds;

  const body = await linearGraphQl<{
    issueCreate?: {
      success?: boolean;
      issue?: LinearIssue | null;
    } | null;
  }>(target.apiKey, {
    query: `mutation SupportIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }`,
    variables: { input: createInput },
  });

  const issue = body.issueCreate?.issue;
  if (!body.issueCreate?.success || !issue) {
    throw new Error("Linear issue creation failed.");
  }

  const repairAgent = await notifyRepairAgent(input, issue);
  return { issue, repairAgent };
}

async function resolveLinearTarget(): Promise<LinearTarget> {
  const apiKey = pickEnv(["LINEAR_API_KEY", "LINEAR_PERSONAL_API_KEY"]);
  if (!apiKey) {
    throw new Error("Set LINEAR_API_KEY to enable Linear support tickets.");
  }

  const configuredTeamId = pickEnv(["LINEAR_SUPPORT_TEAM_ID", "LINEAR_TEAM_ID"]);
  const configuredProjectId = pickEnv([
    "LINEAR_SUPPORT_PROJECT_ID",
    "LINEAR_PROJECT_ID",
  ]);
  const projectName =
    pickEnv(["LINEAR_SUPPORT_PROJECT_NAME", "LINEAR_PROJECT_NAME"]) ??
    DEFAULT_PROJECT_NAME;

  if (configuredProjectId && configuredTeamId) {
    return {
      apiKey,
      teamId: configuredTeamId,
      projectId: configuredProjectId,
      projectName,
    };
  }

  const project = await findLinearProjectByName(apiKey, projectName);
  const teamId = configuredTeamId ?? project?.teams?.nodes?.[0]?.id ?? null;
  if (!teamId) {
    throw new Error(
      `Set LINEAR_SUPPORT_TEAM_ID or create a Linear project named ${projectName}.`
    );
  }

  return {
    apiKey,
    teamId,
    projectId: configuredProjectId ?? project?.id ?? null,
    projectName: project?.name ?? projectName,
  };
}

async function findLinearProjectByName(apiKey: string, name: string) {
  const body = await linearGraphQl<{
    projects?: { nodes?: LinearProject[] | null } | null;
  }>(apiKey, {
    query: `query SupportProject($name: String!) {
      projects(filter: { name: { eqIgnoreCase: $name } }, first: 10) {
        nodes {
          id
          name
          teams {
            nodes {
              id
              key
              name
            }
          }
        }
      }
    }`,
    variables: { name },
  });

  return (
    body.projects?.nodes?.find(
      (project) => project.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}

async function linearGraphQl<T>(
  apiKey: string,
  payload: { query: string; variables?: Record<string, unknown> }
): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: LinearGraphQlResponse<T>;
  try {
    body = JSON.parse(text) as LinearGraphQlResponse<T>;
  } catch {
    throw new Error(`Linear returned invalid JSON: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`Linear request failed: ${response.status} ${text.slice(0, 200)}`);
  }
  if (body.errors?.length) {
    throw new Error(
      `Linear error: ${body.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ")}`
    );
  }
  if (!body.data) {
    throw new Error("Linear returned no data.");
  }

  return body.data;
}

async function notifyRepairAgent(
  input: CreateSupportTicketInput,
  issue: LinearIssue
): Promise<RepairAgentStatus> {
  if (!input.autoRepair) {
    return { status: "skipped", reason: "Auto repair was not requested." };
  }

  const webhookUrl = process.env.SUPPORT_REPAIR_AGENT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return {
      status: "not_configured",
      reason: "Set SUPPORT_REPAIR_AGENT_WEBHOOK_URL to route fixes to maxiclaw.",
    };
  }

  const host = process.env.SUPPORT_REPAIR_AGENT_HOST?.trim() || "maxiclaw";
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = process.env.SUPPORT_REPAIR_AGENT_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        host,
        issue,
        source: input.source,
        topic: input.topic,
        explanation: input.explanation,
        imageUrl: input.imageUrl,
        sourceUrl: input.sourceUrl,
        instruction:
          "Investigate this social-poster issue, fix it in a branch, and open a PR to main.",
      }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      return {
        status: "failed",
        reason: `${response.status} ${message.slice(0, 160)}`,
      };
    }
    return { status: "sent", host };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Repair webhook failed.",
    };
  }
}

function buildIssueTitle(input: CreateSupportTicketInput) {
  const topic = sanitizeSingleLine(input.topic, 120);
  return `[${SUPPORT_TICKET_SOURCE_LABELS[input.source]}] ${topic}`;
}

function buildIssueDescription(input: CreateSupportTicketInput, target: LinearTarget) {
  const rows = [
    `Source: ${SUPPORT_TICKET_SOURCE_LABELS[input.source]} (${input.source})`,
    input.reporter?.email ? `Reporter: ${input.reporter.email}` : null,
    input.workspace?.name ? `Workspace: ${input.workspace.name}` : null,
    input.workspace?.organizationName
      ? `Organization: ${input.workspace.organizationName}`
      : null,
    target.projectName ? `Linear project: ${target.projectName}` : null,
    input.pageTitle ? `Page title: ${sanitizeSingleLine(input.pageTitle, 160)}` : null,
    input.sourceUrl ? `Source URL: ${input.sourceUrl}` : null,
    input.imageUrl ? `Image: ${input.imageUrl}` : null,
    input.autoRepair
      ? `Repair requested: yes, preferred host ${process.env.SUPPORT_REPAIR_AGENT_HOST?.trim() || "maxiclaw"}`
      : null,
    "",
    "Topic",
    sanitizeSingleLine(input.topic, 180),
    "",
    "Explanation",
    sanitizeMultiline(input.explanation, 5000),
  ];

  return rows.filter((row) => row !== null).join("\n");
}

function pickEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeSingleLine(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...`
    : normalized;
}

function sanitizeMultiline(value: string, maxLength: number) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...`
    : normalized;
}
