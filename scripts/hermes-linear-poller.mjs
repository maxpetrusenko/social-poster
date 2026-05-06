#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_STATE_FILE = ".hermes/linear-poller-state.json";
const CLOSED_STATE_TYPES = new Set(["completed", "canceled"]);
const DEFAULT_READY_LABELS = ["agent:ready"];
const DEFAULT_BLOCKED_LABELS = ["agent:needs-context", "agent:blocked"];

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

const config = loadConfig();
const statePath = resolve(options.stateFile || process.env.HERMES_LINEAR_STATE_FILE || DEFAULT_STATE_FILE);
const state = loadState(statePath);
const handled = new Set(state.handledIssueIds ?? []);
const dryRun = options.dryRun || !options.run;

const projects = config.projects;
if (!projects.length) {
  fail("Configure HERMES_LINEAR_PROJECTS with at least one project.");
}

let processedCount = 0;
let candidateCount = 0;

for (const project of projects) {
  const issues = await fetchProjectIssues(config.linearApiKey, project);
  const candidates = issues.filter((issue) => shouldProcessIssue(issue, project, handled));
  candidateCount += candidates.length;

  for (const issue of candidates) {
    processedCount += 1;
    const prompt = buildHermesPrompt(project, issue);
    log(`candidate ${issue.identifier} ${issue.title}`);

    if (dryRun) {
      log(`dry-run prompt:\n${prompt}\n`);
      continue;
    }

    const output = runHermes(project, prompt);
    const prUrl = findPullRequestUrl(output);
    await notifyTelegram(config, project, issue, output, prUrl);
    handled.add(issue.id);
    saveState(statePath, {
      handledIssueIds: [...handled],
      updatedAt: new Date().toISOString(),
    });
  }
}

if (!processedCount) {
  log(`no ready Linear tickets across ${projects.length} project(s)`);
} else if (dryRun) {
  log(`dry-run found ${candidateCount} ready ticket(s); rerun with --run to invoke Hermes`);
}

function parseArgs(args) {
  const parsed = {
    run: false,
    dryRun: false,
    once: true,
    stateFile: "",
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--run") parsed.run = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--once") parsed.once = true;
    else if (arg === "--state-file") parsed.stateFile = args[++index] ?? "";
    else if (arg === "-h" || arg === "--help") parsed.help = true;
    else fail(`Unknown option: ${arg}`);
  }

  return parsed;
}

function loadConfig() {
  const linearApiKey = pickEnv(["LINEAR_API_KEY", "LINEAR_PERSONAL_API_KEY"]);
  if (!linearApiKey) fail("Set LINEAR_API_KEY.");

  return {
    linearApiKey,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || "",
    projects: parseProjects(process.env.HERMES_LINEAR_PROJECTS),
  };
}

function parseProjects(raw) {
  if (!raw?.trim()) return [];
  let projects;
  try {
    projects = JSON.parse(raw);
  } catch (error) {
    fail(`HERMES_LINEAR_PROJECTS must be JSON: ${error.message}`);
  }

  if (!Array.isArray(projects)) fail("HERMES_LINEAR_PROJECTS must be a JSON array.");

  return projects.map((project, index) => {
    const name = readString(project.projectName || project.project || project.linearProjectName);
    const projectId = readString(project.projectId || project.linearProjectId);
    const repo = readString(project.repo);
    const app = readString(project.app || name || repo);
    const cwd = readString(project.cwd || project.repoDir);
    if (!repo) fail(`Project ${index + 1} is missing repo.`);
    if (!name && !projectId) {
      fail(`Project ${index + 1} needs projectName or projectId.`);
    }

    return {
      app,
      repo,
      cwd,
      projectName: name,
      projectId,
      hermesCommand: readCommand(project.hermesCommand),
      hermesSkills: readString(project.hermesSkills) || "github-issues,subagent-driven-development",
      readyLabels: readStringArray(project.readyLabels, DEFAULT_READY_LABELS),
      blockedLabels: readStringArray(project.blockedLabels, DEFAULT_BLOCKED_LABELS),
      requiredStateTypes: readStringArray(project.stateTypes, []),
      telegramChatId: readString(project.telegramChatId),
      runTests: readString(project.runTests) || "lint, typecheck, test",
      extraInstructions: readString(project.extraInstructions),
    };
  });
}

async function fetchProjectIssues(apiKey, project) {
  const projectId = project.projectId || (await findProjectId(apiKey, project.projectName));
  const body = await linearGraphQl(apiKey, {
    query: `query HermesProjectIssues($projectId: ID!) {
      issues(
        first: 50
        filter: { project: { id: { eq: $projectId } } }
      ) {
        nodes {
          id
          identifier
          title
          description
          url
          branchName
          state {
            name
            type
          }
          labels {
            nodes {
              name
            }
          }
        }
      }
    }`,
    variables: { projectId },
  });

  return body.issues?.nodes ?? [];
}

async function findProjectId(apiKey, name) {
  const body = await linearGraphQl(apiKey, {
    query: `query HermesLinearProject($name: String!) {
      projects(filter: { name: { eqIgnoreCase: $name } }, first: 10) {
        nodes {
          id
          name
        }
      }
    }`,
    variables: { name },
  });

  const project = body.projects?.nodes?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase()
  );
  if (!project?.id) fail(`Linear project not found: ${name}`);
  return project.id;
}

async function linearGraphQl(apiKey, payload) {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`Linear returned invalid JSON: ${response.status}`);
  }
  if (!response.ok) fail(`Linear request failed: ${response.status} ${text.slice(0, 200)}`);
  if (body.errors?.length) {
    fail(`Linear error: ${body.errors.map((error) => error.message).join("; ")}`);
  }
  return body.data;
}

function shouldProcessIssue(issue, project, handled) {
  if (handled.has(issue.id)) return false;
  const stateType = issue.state?.type ?? "";
  if (CLOSED_STATE_TYPES.has(stateType)) return false;
  if (project.requiredStateTypes.length && !project.requiredStateTypes.includes(stateType)) {
    return false;
  }

  const labels = new Set((issue.labels?.nodes ?? []).map((label) => label.name?.toLowerCase()));
  if (project.blockedLabels.some((label) => labels.has(label.toLowerCase()))) return false;
  return project.readyLabels.some((label) => labels.has(label.toLowerCase()));
}

function buildHermesPrompt(project, issue) {
  const lines = [
    `Linear ticket: ${issue.identifier}`,
    `URL: ${issue.url}`,
    `Project app: ${project.app}`,
    `Repository: ${project.repo}`,
    project.cwd ? `Local repo path: ${project.cwd}` : null,
    "",
    "Workflow:",
    "1. Verify the issue is reproducible or clearly specified.",
    "2. If more context is needed, ask in Linear and stop. Do not guess.",
    "3. Fix locally with TDD where practical. Add a regression test for bugs.",
    `4. Run ${project.runTests}.`,
    "5. Commit with a Conventional Commit.",
    "6. Push a branch and open a draft PR. Do not merge.",
    "7. Return the PR URL and exact verification commands/results.",
    "",
    "Notify Max only after the PR exists and tests pass.",
    project.extraInstructions ? `Extra instructions: ${project.extraInstructions}` : null,
    "",
    "Ticket title:",
    issue.title,
    "",
    "Ticket description:",
    issue.description || "(No description.)",
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function runHermes(project, prompt) {
  const [command, ...commandPrefixArgs] = project.hermesCommand;
  const args = ["chat", "-Q", "--worktree", "-s", project.hermesSkills, "-q", prompt];
  const commandOptions = {
    cwd: project.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  };
  const result = spawnSync(command, [...commandPrefixArgs, ...args], commandOptions);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.status !== 0) {
    throw new Error(`Hermes failed with exit ${result.status}:\n${output}`);
  }
  log(output.trim());
  return output;
}

async function notifyTelegram(config, project, issue, output, prUrl) {
  const token = config.telegramBotToken;
  const chatId = project.telegramChatId || config.telegramChatId;
  if (!token || !chatId) {
    log("telegram not configured; skipping notification");
    return;
  }

  const message = [
    `Resolved ${issue.identifier} for ${project.app}.`,
    prUrl ? `PR: ${prUrl}` : "PR URL was not detected in Hermes output.",
    `Ticket: ${issue.url}`,
    "",
    truncate(output.trim(), 1200),
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Telegram notification failed: ${response.status} ${text.slice(0, 160)}`);
  }
}

function findPullRequestUrl(output) {
  return output.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)?.[0] ?? "";
}

function loadState(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { handledIssueIds: [] };
  }
}

function saveState(path, nextState) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(nextState, null, 2)}\n`);
  renameSync(tempPath, path);
}

function pickEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value, fallback) {
  if (Array.isArray(value)) return value.map(readString).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(readString).filter(Boolean);
  return fallback;
}

function readCommand(value) {
  if (Array.isArray(value)) {
    const command = value.map(readString).filter(Boolean);
    return command.length ? command : ["hermes"];
  }
  const command = readString(value).split(/\s+/).filter(Boolean);
  return command.length ? command : ["hermes"];
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function log(message) {
  console.log(`[hermes-linear-poller] ${message}`);
}

function fail(message) {
  console.error(`[hermes-linear-poller] ${message}`);
  process.exit(1);
}

function printUsage() {
  console.log(`usage: node scripts/hermes-linear-poller.mjs [--dry-run|--run]

Poll configured Linear projects for ready tickets and hand them to Hermes.
Default is dry-run. Use --run from a cron/systemd timer.

Required env:
  LINEAR_API_KEY
  HERMES_LINEAR_PROJECTS='[{"app":"social-poster","repo":"maxpetrusenko/social-poster","projectName":"SocialClaw","cwd":"/Users/maxpetrusenko/Desktop/Projects/social-poster"}]'

Optional env:
  TELEGRAM_BOT_TOKEN
  TELEGRAM_CHAT_ID
  HERMES_LINEAR_STATE_FILE
`);
}
