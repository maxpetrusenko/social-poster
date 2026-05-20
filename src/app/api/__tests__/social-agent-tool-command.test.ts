import { describe, expect, it } from "vitest";

import { extractExplicitToolCall } from "@/app/api/social-agent/tool-command";

describe("social agent tool command parsing", () => {
  it("reads an explicit toolCall payload", () => {
    expect(
      extractExplicitToolCall({
        toolCall: {
          name: "internal_context_summary",
          input: {},
        },
      })
    ).toEqual({
      name: "internal_context_summary",
      input: {},
    });
  });

  it("reads a structured command object", () => {
    expect(
      extractExplicitToolCall({
        command: {
          type: "tool_call",
          toolCall: {
            name: "internal_activity_list",
            input: {
              limit: 5,
            },
          },
        },
      })
    ).toEqual({
      name: "internal_activity_list",
      input: {
        limit: 5,
      },
    });
  });

  it("reads a structured slash command", () => {
    expect(
      extractExplicitToolCall({
        message: '/tool internal_post_create_draft {"content":"Draft update","title":"Launch"}',
      })
    ).toEqual({
      name: "internal_post_create_draft",
      input: {
        content: "Draft update",
        title: "Launch",
      },
    });
  });

  it("reads an explicit JSON slash command", () => {
    expect(
      extractExplicitToolCall({
        message: '/tool {"name":"internal_context_summary","input":{}}',
      })
    ).toEqual({
      name: "internal_context_summary",
      input: {},
    });
  });

  it("reads a structured command payload string", () => {
    expect(
      extractExplicitToolCall({
        command: '/tool internal_context_summary {}',
      })
    ).toEqual({
      name: "internal_context_summary",
      input: {},
    });
  });

  it("ignores normal chat messages", () => {
    expect(
      extractExplicitToolCall({
        message: "Can you draft a post for launch day?",
      })
    ).toBeNull();
  });

  it("does not treat unprefixed JSON chat as a tool call", () => {
    expect(
      extractExplicitToolCall({
        message: '{"name":"Instagram","input":"why is connection failing?"}',
      })
    ).toBeNull();
  });

  it("does not treat unprefixed JSON for a real tool as a tool call", () => {
    expect(
      extractExplicitToolCall({
        message: '{"name":"internal_post_create_draft","input":{"title":"Launch"}}',
      })
    ).toBeNull();
  });

  it("does not treat a one-word platform reply as a tool call", () => {
    expect(
      extractExplicitToolCall({
        message: "Instagram",
      })
    ).toBeNull();
  });

  it("does not treat unprefixed tool-like chat as a tool call", () => {
    expect(
      extractExplicitToolCall({
        message: 'internal_post_create_draft {"content":"Draft update"}',
      })
    ).toBeNull();
  });
});
