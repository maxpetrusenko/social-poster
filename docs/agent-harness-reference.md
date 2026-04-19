# Agent Harness Reference — Phase 4 Design

> Architecture reference for `src/agent/` implementation
> Last updated: 2026-04-17

---

## 1. Current State

### What Exists

The current "social agent" is a single API route with context loading:

- **`src/app/api/social-agent/route.ts`** — Chat endpoint using OpenAI Responses API
- **`src/lib/social-agent/context.ts`** — Loads workspace data (platforms, posts, replies, schedules, RSS) into a `SocialAgentContext` struct

### Current Architecture

```
Browser Chat Widget
       │
       ▼
POST /api/social-agent
       │
       ├─→ loadSocialAgentContext()  (DB query → sanitized struct)
       ├─→ handleInlineAction()      (/invite command parsing)
       ├─→ answerDirectlyFromContext() (keyword matching for replies, connections, schedules)
       └─→ answerWithContext()        (OpenAI call with full context in system prompt)
              │
              ▼
       Single LLM call → text response
```

### Current Limitations

1. **No tool calling** — Agent can only read context, not take actions via tools
2. **Single LLM call** — No multi-turn reasoning or tool-calling loop
3. **Inline actions are string-parsed** — Only `/invite` command, regex-based
4. **No platform API calls** — Cannot post, fetch analytics, read DMs
5. **No guardrails** — No confirmation before destructive actions
6. **No audit trail** — No logging of agent actions or tool executions
7. **Context is read-only** — Agent sees DB state but cannot modify it via tools

---

## 2. Target Architecture (Phase 4)

### Design Principles

1. **Tool-based actions** — Every platform operation is a typed tool the agent can call
2. **Capability-driven** — Tools auto-register based on PlatformModule capabilities
3. **Guardrailed** — Destructive actions (publish, delete, send DM) require user confirmation
4. **Audited** — Every tool execution is logged with input/output/timestamp
5. **Pluggable** — Plugins can intercept tool calls for safety, rate limiting, or custom logic

### Target Architecture

```
Browser Chat Widget
       │
       ▼
POST /api/social-agent
       │
       ▼
┌─────────────────────────────────────────┐
│  Agent Runtime (src/agent/runtime.ts)   │
│                                         │
│  ┌─────────┐  ┌──────────────────────┐  │
│  │ Context │  │  Tool Registry       │  │
│  │ Loader  │  │  (auto-discovered)   │  │
│  └────┬────┘  └──────────┬───────────┘  │
│       │                  │              │
│       ▼                  ▼              │
│  ┌─────────────────────────────────┐    │
│  │  Conversation Loop              │    │
│  │                                 │    │
│  │  1. User message                │    │
│  │  2. LLM call with tools        │    │
│  │  3. If tool_call → execute      │    │
│  │     → plugin pipeline           │    │
│  │     → guardrail check           │    │
│  │     → execute tool              │    │
│  │     → audit log                 │    │
│  │     → return result to LLM      │    │
│  │  4. Repeat until text response  │    │
│  │  5. Return to user              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Plugins: guardrail, audit, rate-limit  │
└─────────────────────────────────────────┘
       │
       ├─→ PlatformConnector (adapts PlatformModule for agent)
       │     ├─→ X: post, analytics, inbox, comments, engagement
       │     ├─→ LinkedIn: post, analytics, comments
       │     ├─→ Instagram: post, analytics, comments, inbox
       │     └─→ ... (all platforms)
       │
       └─→ Internal tools (post management, schedule, reply queue)
```

---

## 3. Core Types

### `src/agent/types.ts`

```typescript
// Tool definition — what the agent can call
type AgentTool = {
  name: string;                          // e.g. "x_post_tweet"
  description: string;                   // For LLM function calling
  parameters: JSONSchema;                // Input schema
  platform?: string;                     // Optional platform association
  capability?: PlatformCapability;       // Which capability this serves
  requiresConfirmation: boolean;         // Guardrail: pause for user approval
  execute: (input: unknown, ctx: AgentContext) => Promise<ToolResult>;
};

// Result of a tool execution
type ToolResult = {
  success: boolean;
  data?: unknown;                        // Returned to LLM as context
  error?: string;                        // Error message if failed
  displayMessage?: string;               // Human-readable message for chat
  requiresFollowUp?: boolean;            // Agent should continue reasoning
};

// Runtime context available to every tool
type AgentContext = {
  workspaceId: string;
  userId: string;
  sessionId: string;
  platforms: Map<string, PlatformModule>; // Connected platforms
  pendingConfirmations: Map<string, PendingAction>; // Awaiting user approval
};

// Plugin interface — intercepts tool execution
type AgentPlugin = {
  name: string;
  priority: number;                      // Lower = runs first
  beforeToolCall?: (tool: AgentTool, input: unknown, ctx: AgentContext) => Promise<PluginResult>;
  afterToolCall?: (tool: AgentTool, input: unknown, result: ToolResult, ctx: AgentContext) => Promise<void>;
};

type PluginResult = 
  | { action: "continue" }               // Proceed with tool execution
  | { action: "block"; reason: string }   // Prevent execution
  | { action: "confirm"; message: string }; // Ask user for confirmation

// Pending confirmation
type PendingAction = {
  id: string;
  tool: string;
  input: unknown;
  confirmMessage: string;
  createdAt: Date;
  expiresAt: Date;
};
```

---

## 4. Tool Registry

### `src/agent/tools/registry.ts`

Auto-discovers tools from:
1. **Platform connectors** — Each connected PlatformModule generates tools based on capabilities
2. **Internal tools** — Post management, scheduling, reply queue operations

```
Tool naming convention: {platform}_{capability}_{action}
Examples:
  x_posting_create_tweet
  x_analytics_get_metrics
  x_inbox_list_conversations
  x_comments_reply
  x_engagement_like
  linkedin_posting_create_post
  linkedin_analytics_get_followers
  instagram_posting_create_reel
  internal_post_create_draft
  internal_schedule_list
  internal_reply_approve
```

### Tool Categories

| Category | Tools | Guardrail |
|---|---|---|
| **Read** | get_metrics, list_posts, list_conversations, get_profile | None |
| **Draft** | create_draft, update_draft | None |
| **Publish** | publish_post, send_message, send_reply | Requires confirmation |
| **Delete** | delete_post, delete_comment | Requires confirmation |
| **Engage** | like, repost, follow | None (low risk) |
| **Admin** | connect_platform, update_schedule | Requires confirmation |

---

## 5. Platform Connector

### `src/agent/connectors/platform-connector.ts`

Adapts a `PlatformModule` (from `src/platforms/`) into agent-callable tools.

```
PlatformModule capabilities → Agent tools mapping:

posting:
  → {platform}_posting_create     (create post/tweet/pin)
  → {platform}_posting_delete     (delete post)
  → {platform}_posting_schedule   (schedule for later)
  → {platform}_posting_edit       (edit if supported)

analytics:
  → {platform}_analytics_account  (account-level metrics)
  → {platform}_analytics_post     (per-post metrics)
  → {platform}_analytics_audience (demographics)

inbox:
  → {platform}_inbox_list         (list conversations)
  → {platform}_inbox_read         (read messages)
  → {platform}_inbox_send         (send message)

comments:
  → {platform}_comments_list      (list comments on post)
  → {platform}_comments_reply     (reply to comment)
  → {platform}_comments_delete    (delete comment)
  → {platform}_comments_moderate  (hide/approve/reject)

engagement:
  → {platform}_engagement_like    (like/favourite/react)
  → {platform}_engagement_repost  (repost/boost/retweet)
  → {platform}_engagement_follow  (follow user)
  → {platform}_engagement_unlike  (undo like)

webhooks:
  → {platform}_webhooks_subscribe (subscribe to events)
  → {platform}_webhooks_list      (list active subscriptions)
```

### `src/agent/connectors/connector-registry.ts`

```typescript
// Auto-discovers capabilities from all connected platforms
function buildToolRegistry(platforms: Map<string, PlatformModule>): AgentTool[] {
  const tools: AgentTool[] = [];
  
  for (const [platformId, module] of platforms) {
    if (module.posting) {
      tools.push(createPostingTool(platformId, module));
      tools.push(deletePostTool(platformId, module));
    }
    if (module.analytics) {
      tools.push(accountAnalyticsTool(platformId, module));
      tools.push(postAnalyticsTool(platformId, module));
    }
    if (module.inbox) {
      tools.push(listConversationsTool(platformId, module));
      tools.push(sendMessageTool(platformId, module));
    }
    // ... etc for each capability
  }
  
  // Add internal tools (always available)
  tools.push(...internalTools);
  
  return tools;
}
```

---

## 6. Conversation Runtime

### `src/agent/runtime.ts`

The runtime implements a tool-calling loop:

```
┌──────────────────────────────────────────┐
│  User: "Post my new article to X and LI" │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  LLM Call #1                             │
│  System: tools + context                 │
│  User: message                           │
│  → tool_calls: [                         │
│      x_posting_create({text: "..."}),    │
│      linkedin_posting_create({text: "..."})│
│    ]                                     │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  Guardrail Plugin                        │
│  Both are publish actions → confirm      │
│  → Return to user: "Post to X and       │
│    LinkedIn? [Confirm] [Cancel]"         │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  User: "Confirm"                         │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  Execute tools                           │
│  → x_posting_create: { success, url }    │
│  → linkedin_posting_create: { success }  │
│  → Audit log both executions             │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  LLM Call #2                             │
│  Tool results → final text response      │
│  "Posted to X (url) and LinkedIn.        │
│   Both successful."                      │
└──────────────────────────────────────────┘
```

### Runtime Configuration

```typescript
// src/agent/config.ts
const agentConfig = {
  model: process.env.AGENT_MODEL || "gpt-5-mini",
  maxToolCalls: 10,           // Max tool calls per conversation turn
  maxTurns: 5,                // Max LLM round-trips per request
  confirmationTimeout: 300,    // 5 min for user to confirm
  temperature: 0.3,           // Low temp for reliable tool calling
  plugins: [
    guardrailPlugin,           // Confirm before destructive actions
    auditPlugin,               // Log all tool executions
    rateLimitPlugin,           // Respect platform rate limits
  ],
};
```

---

## 7. Plugins

### Guardrail Plugin (`src/agent/plugins/guardrail-plugin.ts`)

```
Rules:
1. Publishing (post, tweet, message) → ALWAYS confirm with user
2. Deletion (delete post, delete comment) → ALWAYS confirm
3. Account changes (disconnect, update settings) → ALWAYS confirm
4. Read operations → never confirm
5. Low-risk engagement (like, bookmark) → never confirm
6. Batch operations (>3 items) → confirm even if individual ops are safe

Confirmation flow:
- Plugin returns { action: "confirm", message: "About to post to X: '...'. Proceed?" }
- Runtime stores PendingAction and returns confirmation prompt to user
- User responds "yes"/"confirm" → runtime executes stored action
- Timeout (5 min) → action expires, user must re-request
```

### Audit Plugin (`src/agent/plugins/audit-plugin.ts`)

```
Logs to: agent_audit_log table (or structured log)

Fields:
- timestamp
- workspace_id
- user_id  
- session_id
- tool_name
- tool_input (sanitized — no tokens/passwords)
- tool_output (truncated)
- success: boolean
- duration_ms
- platform_id (if platform tool)
- confirmation_required: boolean
- confirmed_at (if applicable)
```

### Rate Limit Plugin (`src/agent/plugins/rate-limit-plugin.ts`)

```
Before each platform tool call:
1. Check platform's rate limit config
2. Check recent call count from audit log
3. If over threshold → block with "Rate limit approaching for {platform}. Try again in X minutes."
4. Log remaining capacity in tool result
```

---

## 8. Internal Tools (Non-Platform)

Always available regardless of connected platforms:

| Tool | Description | Guardrail |
|---|---|---|
| `internal_post_create_draft` | Create a new post draft | None |
| `internal_post_list` | List recent posts | None |
| `internal_post_publish` | Publish a draft post | Confirm |
| `internal_schedule_list` | List schedules | None |
| `internal_schedule_toggle` | Enable/disable schedule | Confirm |
| `internal_reply_list_review` | List reply candidates in review | None |
| `internal_reply_approve` | Move reply to ready lane | None |
| `internal_reply_post` | Post a ready reply | Confirm |
| `internal_reply_skip` | Skip/dismiss a reply | None |
| `internal_platform_list` | List connected platforms | None |
| `internal_platform_status` | Check platform connection health | None |
| `internal_rss_list_sources` | List RSS sources | None |
| `internal_workspace_invite` | Invite team member | Confirm |

---

## 9. Migration Path from Current Agent

### Step 1: Extract context loading (already done)
Current `loadSocialAgentContext()` stays as-is. Agent runtime wraps it.

### Step 2: Add tool registry
Create `src/agent/tools/` with internal tools first. No platform tools yet.

### Step 3: Implement runtime loop
Replace single OpenAI call in `route.ts` with:
```
while (turn < maxTurns) {
  response = await llm.call(messages, tools)
  if (response.type === 'text') return response.text
  if (response.type === 'tool_calls') {
    for (call of response.tool_calls) {
      result = await executeWithPlugins(call)
      messages.push(toolResult(call, result))
    }
  }
  turn++
}
```

### Step 4: Add guardrail + audit plugins
Wire in before/after hooks on tool execution.

### Step 5: Connect platform tools
As Phase 2 (X deep) lands, register X-specific tools via connector.

### Step 6: Expand to all platforms
As Phase 5 adds depth to other platforms, tools auto-register via connector registry.

---

## 10. LLM Provider Strategy

### Current: OpenAI Responses API
- Model: `gpt-5-mini` (configurable)
- Single call, no tool use

### Target: Multi-provider with tool calling
```
Primary: OpenAI (gpt-5-mini or gpt-5)
  - Responses API with tool definitions
  - Supports parallel tool calls

Fallback: Anthropic (claude-sonnet-4-6 or claude-haiku-4-5)
  - Messages API with tool_use
  - Different format but same capability

Configuration:
  AGENT_PROVIDER=openai|anthropic
  AGENT_MODEL=gpt-5-mini|claude-haiku-4-5-20251001
```

### Tool Definition Format (OpenAI → Anthropic mapping)

Both providers support JSON Schema tool definitions. Abstract behind:
```typescript
type ToolDefinition = {
  name: string;
  description: string;
  parameters: JSONSchema;
};

// Adapter converts to provider-specific format
function toOpenAITool(def: ToolDefinition): OpenAIFunctionTool { ... }
function toAnthropicTool(def: ToolDefinition): AnthropicTool { ... }
```

---

## 11. Key Design Decisions

1. **Tools over prompting** — Platform actions are tools, not prompt-engineered text parsing. This is more reliable and auditable.

2. **Capabilities drive tools** — If a platform doesn't implement `analytics`, no analytics tools are registered for it. No stub/error tools.

3. **Guardrails are plugins, not hardcoded** — Can swap confirmation UX (chat confirm, modal, email approval) without changing tool code.

4. **Audit is mandatory** — Every tool call is logged. No opt-out. Required for debugging and compliance.

5. **Rate limits are cooperative** — Agent checks limits before calling. Platform rate limiters are the last line of defense.

6. **Context is workspace-scoped** — Agent only sees/acts on the current workspace. Multi-workspace operations require explicit workspace switching.

7. **Confirmation is stateful** — PendingAction has TTL. If user doesn't confirm within timeout, action expires. Prevents stale confirmations.

8. **Batch operations are special** — If agent wants to post to 5 platforms, guardrail groups them into single confirmation rather than 5 separate prompts.

---

## 12. File Structure

```
src/agent/
├── types.ts                  # AgentTool, ToolResult, AgentContext, AgentPlugin
├── runtime.ts                # Conversation loop with tool calling
├── config.ts                 # Model selection, plugin config, limits
├── tools/
│   ├── registry.ts           # Auto-discovers and registers all tools
│   ├── post-tool.ts          # internal_post_* tools
│   ├── schedule-tool.ts      # internal_schedule_* tools
│   ├── reply-tool.ts         # internal_reply_* tools
│   ├── platform-tool.ts      # internal_platform_* tools
│   ├── analytics-tool.ts     # Platform analytics tools
│   ├── inbox-tool.ts         # Platform messaging tools
│   ├── comments-tool.ts      # Platform comment tools
│   ├── engagement-tool.ts    # Platform engagement tools (like, repost, follow)
│   └── connect-tool.ts       # Platform connection management
├── connectors/
│   ├── platform-connector.ts # Adapts PlatformModule → AgentTools
│   └── connector-registry.ts # Auto-discovers from connected platforms
├── plugins/
│   ├── types.ts              # Plugin interfaces
│   ├── guardrail-plugin.ts   # Confirm before publish/delete/admin
│   ├── audit-plugin.ts       # Log all tool executions
│   └── rate-limit-plugin.ts  # Pre-check platform rate limits
└── providers/
    ├── types.ts              # LLM provider interface
    ├── openai-provider.ts    # OpenAI Responses API adapter
    └── anthropic-provider.ts # Anthropic Messages API adapter
```
