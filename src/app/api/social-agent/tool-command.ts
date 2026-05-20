import type { AgentToolCall } from "@/agent/types";

export type SocialAgentToolCommandEnvelope = {
  message?: string | null;
  toolCall?: unknown;
  command?: unknown;
};

export function extractExplicitToolCall(input: SocialAgentToolCommandEnvelope): AgentToolCall | null {
  return (
    normalizeToolCallValue(input.toolCall) ??
    normalizeCommandValue(input.command) ??
    parseMessageToolCommand(input.message ?? null)
  );
}

function normalizeCommandValue(value: unknown): AgentToolCall | null {
  if (typeof value === "string") return parseCommandString(value);
  if (!isRecord(value)) return null;
  if ("toolCall" in value) return normalizeToolCallValue(value.toolCall);
  if ("name" in value && "input" in value) return normalizeToolCallValue(value);
  if (value.type === "tool_call" || value.type === "internal_tool_call") {
    return normalizeToolCallValue(value.toolCall ?? value);
  }

  return null;
}

function normalizeToolCallValue(value: unknown): AgentToolCall | null {
  if (!isRecord(value)) return null;

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return null;

  return {
    name,
    input: value.input,
  };
}

function parseMessageToolCommand(message: string | null): AgentToolCall | null {
  if (!message) return null;

  const normalized = message.trim();
  if (!normalized) return null;

  const match = normalized.match(/^\/(?:tool|agent-tool|internal-tool)\s+(.+)$/i);
  if (!match) return null;

  return parsePrefixedToolCall(match[1]?.trim() ?? "");
}

function parseCommandString(value: string): AgentToolCall | null {
  const normalized = value.trim();
  if (!normalized) return null;

  if (normalized.startsWith("{")) {
    return parseJsonToolCall(normalized);
  }

  return parseMessageToolCommand(normalized);
}

function parsePrefixedToolCall(raw: string): AgentToolCall | null {
  if (!raw) return null;

  if (raw.startsWith("{")) {
    return parseJsonToolCall(raw);
  }

  const [command, ...rest] = raw.split(/\s+/);
  const name = command?.trim() ?? "";
  if (!name) return null;

  const restText = rest.join(" ").trim();
  if (!restText) {
    return { name, input: {} };
  }

  if (restText.startsWith("{") || restText.startsWith("[")) {
    try {
      return {
        name,
        input: JSON.parse(restText),
      };
    } catch {
      return null;
    }
  }

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const pipeName = raw.slice(0, pipeIndex).trim();
    const pipeInput = raw.slice(pipeIndex + 1).trim();
    if (!pipeName) return null;
    if (!pipeInput) return { name: pipeName, input: {} };
    try {
      return {
        name: pipeName,
        input: JSON.parse(pipeInput),
      };
    } catch {
      return null;
    }
  }

  return null;
}

function parseJsonToolCall(raw: string): AgentToolCall | null {
  try {
    return normalizeCommandValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
