export type ReplyDirection = "product" | "dev" | "github";

export type ReplyDiscoveryQuery = {
  query: string;
  direction: ReplyDirection;
};

const PRODUCT_KEYWORDS = [
  "support",
  "customer service",
  "lead",
  "lead gen",
  "real estate",
  "sales",
  "receptionist",
  "workflow",
  "ops",
  "personalization",
  "memory",
  "assistant",
  "use case",
];

const DEV_KEYWORDS = [
  "latency",
  "tool call",
  "tool calls",
  "transcript",
  "transcripts",
  "replay",
  "deterministic",
  "debug",
  "debugging",
  "sdk",
  "api",
  "eval",
  "evals",
  "realtime",
  "real-time",
  "voice agent",
  "pipeline",
  "state",
  "participant",
  "webrtc",
];

const GITHUB_KEYWORDS = [
  "github",
  "repo",
  "repository",
  "open source",
  "open-source",
  "oss",
  "framework",
  "library",
  "sdk",
  "examples",
  "star",
];

export const LIVE_REPLY_DISCOVERY_QUERIES: ReplyDiscoveryQuery[] = [
  { query: "support bot customer service ai", direction: "product" },
  { query: "real estate ai assistant", direction: "product" },
  { query: "sales assistant automation", direction: "product" },
  { query: "voice agent debugging", direction: "dev" },
  { query: "realtime tool calls transcripts", direction: "dev" },
  { query: "agent evals replay debugging", direction: "dev" },
  { query: "voice ai errors debugging", direction: "dev" },
  { query: "agent prompt drift debugging", direction: "dev" },
  { query: "multimodal realtime agent thread", direction: "dev" },
  { query: "open source ai agent framework", direction: "github" },
  { query: "github ai agent repo", direction: "github" },
  { query: "voice agent sdk open source", direction: "github" },
];

export const REPLY_AUTO_DRAFT_SEARCH_QUERIES = LIVE_REPLY_DISCOVERY_QUERIES.map(
  ({ query }) => query
);

export function inferReplyDirection(input: {
  text: string;
  tags?: string[];
  category?: string;
  query?: string;
}) {
  const haystack = [
    input.text,
    ...(input.tags ?? []),
    input.category ?? "",
    input.query ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (matchesAny(haystack, GITHUB_KEYWORDS)) return "github";
  if (matchesAny(haystack, DEV_KEYWORDS)) return "dev";
  if (matchesAny(haystack, PRODUCT_KEYWORDS)) return "product";
  return "dev";
}

export function getReplyDirectionLabel(direction: ReplyDirection) {
  switch (direction) {
    case "product":
      return "Product usecase";
    case "dev":
      return "Dev build";
    case "github":
      return "GitHub repo";
  }
}

export function getReplyDirectionSummary(direction: ReplyDirection) {
  switch (direction) {
    case "product":
      return "Bridge the tweet to a concrete business use case and a soft product pull.";
    case "dev":
      return "Lead with mechanism, failure mode, or debugging insight to earn technical trust.";
    case "github":
      return "Point people toward the open repo and public implementation, not a generic pitch.";
  }
}

function matchesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}
