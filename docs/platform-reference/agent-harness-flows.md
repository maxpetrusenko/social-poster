---
title: Agent Harness Flows — Platform Depth
summary: Text-first view of the future TypeScript agent harness, including tool loop, guardrails, audit log, connector registry, and UI shape.
read_when:
  - You are implementing or reviewing the future TypeScript agent harness.
  - You need the intended tool loop and safety model before coding the runtime.
  - You want a textual equivalent of the restructure diagram in platform-depth-restructure.html.
---

# Agent Harness Flows — Platform Depth

> Planned `src/agent/` shape for the social-poster rebuild
> Last reviewed: 2026-04-17

## Intent

The agent harness is the control plane for all platform actions. It should decide, call tools, record every action, and hand results back to the UI with the smallest possible amount of hidden state.

## Tool Loop

```text
user message
  -> normalize intent
  -> pick allowed tools
  -> LLM proposes next action
  -> guardrail plugin checks action
  -> tool executes
  -> result returns
  -> audit entry writes
  -> model gets next context chunk or final answer
```

### Loop rules

- One tool call at a time unless the tools are clearly parallel-safe.
- Every action must be attributable to a user request or a deterministic automation rule.
- Tool results should be compact and structured, not pasted raw into the chat.

## Guardrails

Guardrails sit in front of tool execution, not after the fact.

| Guardrail | Job |
|---|---|
| Pre-tool check | Block disallowed writes, secrets exposure, unsupported platform actions, and missing confirmation. |
| Post-tool check | Normalize results, attach metadata, and record side effects. |
| Human confirmation | Required for destructive or externally visible publish actions. |

## Audit Log

Every meaningful step writes to an audit log.

```text
request
  -> tool selection
  -> approval check
  -> tool input
  -> tool output
  -> platform side effect
  -> final status
```

The log should capture:

- actor
- workspace
- platform
- tool name
- timestamps
- request hash
- outcome
- error text when present

## Connector Registry

The connector registry is the directory of platform capabilities, not just a list of platforms.

```text
platform registry
  -> platform module
  -> capability flags
  -> auth model
  -> tool map
  -> rate and visibility limits
```

Recommended registry shape:

| Field | Purpose |
|---|---|
| platform id | Stable key like `x`, `linkedin`, `tiktok`. |
| capabilities | `post`, `analytics`, `inbox`, `comments`, `engagement`, `webhooks`. |
| auth type | OAuth, token, app password, bot token, webhook. |
| visibility model | user, page, profile, board, location, subreddit, channel. |
| notes | Any platform-specific constraints or review gates. |

## Future UI Shape

The UI should present the agent as an operational surface, not a toy chat box.

```text
left: workspace and platform selection
center: conversation + tool trace + approval prompts
right: audit log + connector health + capability summary
bottom: draft composer or action review tray
```

### UI shape rules

- Show tool calls inline, with human-readable labels.
- Show platform capability chips before the user attempts a write.
- Show approval gates before publish actions.
- Make the audit trail visible enough that a user can reconstruct what happened without reading raw logs.

## References

- `docs/plans/platform-depth-restructure.html`
- `docs/plans/provider-architecture.md`
- `docs/plans/parity-implementation-backlog.md`
