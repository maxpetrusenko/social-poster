import { spawn } from "node:child_process";

export const CLI_PROVIDER_TIMEOUT_MS = 90_000;

export type CliOptions = {
  bin?: string;
  timeoutMs?: number;
  env?: EnvMap;
};

export type EnvMap = Record<string, string | undefined>;

const CLAUDE_STRIPPED_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
const CODEX_STRIPPED_ENV = ["OPENAI_API_KEY"];

export function stripEnv(env: EnvMap, keys: string[]): EnvMap {
  const next = { ...env };
  for (const key of keys) delete next[key];
  return next;
}

/** No tools, no MCP: tweet text is untrusted input. */
export function claudeArgs(): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--disallowedTools",
    "Bash",
    "Edit",
    "Write",
    "WebFetch",
    "WebSearch",
  ];
}

export function codexArgs(): string[] {
  return [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "-",
  ];
}

function runCli(
  bin: string,
  args: string[],
  input: string,
  env: EnvMap,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(bin, args, { env: env as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"] });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`${bin} timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(new Error(err.code === "ENOENT" ? `${bin} binary not found` : `${bin}: ${err.message}`))
      );
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${bin} exited ${code}: ${stderr.trim().slice(0, 200)}`));
      });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

export async function runClaudeCli(prompt: string, options: CliOptions = {}): Promise<string> {
  const bin = options.bin ?? "claude";
  const env = stripEnv(options.env ?? process.env, CLAUDE_STRIPPED_ENV);
  const out = await runCli(bin, claudeArgs(), prompt, env, options.timeoutMs ?? CLI_PROVIDER_TIMEOUT_MS);
  let parsed: { result?: unknown; is_error?: unknown };
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error("claude returned non-JSON output");
  }
  if (parsed.is_error === true) {
    throw new Error(`claude reported an error: ${String(parsed.result).slice(0, 200)}`);
  }
  if (typeof parsed.result !== "string" || !parsed.result.trim()) {
    throw new Error("claude returned no result text");
  }
  return parsed.result;
}

export async function runCodexCli(prompt: string, options: CliOptions = {}): Promise<string> {
  const bin = options.bin ?? "codex";
  const env = stripEnv(options.env ?? process.env, CODEX_STRIPPED_ENV);
  const out = await runCli(bin, codexArgs(), prompt, env, options.timeoutMs ?? CLI_PROVIDER_TIMEOUT_MS);
  if (!out.trim()) throw new Error("codex returned no output");
  return out;
}
