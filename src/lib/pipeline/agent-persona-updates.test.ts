import { test } from "vitest";
import assert from "node:assert/strict";

import {
  loadAgentPersonaScheduleContext,
  renderAgentPersonaScheduleContent,
  resolveAgentPersonaScheduleContent,
} from "./agent-persona-updates.ts";

test("resolveAgentPersonaScheduleContent builds x and linkedin copy from site and github activity", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppUrl = process.env.APP_URL;

  process.env.APP_URL = "https://social.maxpetrusenko.com";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "https://agent-persona.org/") {
      return new Response(
        `
        <html>
          <head>
            <title>Persona6 | Grounded AI personas for live products</title>
            <meta name="description" content="Grounded AI personas for live products.">
          </head>
          <body>
            <h3><a href="./blog/memory-is-not-identity/">Memory Is Not Identity</a></h3>
            <h3><a href="./blog/discord-agents-for-community-continuity/">How to put grounded agents inside a Discord server</a></h3>
          </body>
        </html>
        `,
        { status: 200 }
      );
    }

    if (url.includes("/orgs/agent-persona/events")) {
      return new Response(
        JSON.stringify([
          {
            id: "ev-pr-1",
            type: "PullRequestEvent",
            created_at: "2026-04-14T12:00:00.000Z",
            repo: { name: "agent-persona/personas-pipeline" },
            payload: {
              action: "opened",
              pull_request: {
                title: "feat(crawler): vendor feature crawler and add segmentation adapter",
                html_url: "https://github.com/agent-persona/personas-pipeline/pull/42",
              },
            },
          },
          {
            id: "ev-issue-1",
            type: "IssuesEvent",
            created_at: "2026-04-14T10:00:00.000Z",
            repo: { name: "agent-persona/agent-personas-project" },
            payload: {
              action: "closed",
              issue: {
                title: "configuring eval with persona pipeline",
                html_url: "https://github.com/agent-persona/agent-personas-project/issues/7",
              },
            },
          },
        ]),
        { status: 200 }
      );
    }

    if (url.includes("/repos/agent-persona/personas-pipeline")) {
      return new Response(
        JSON.stringify({
          html_url: "https://github.com/agent-persona/personas-pipeline",
          stargazers_count: 42,
        }),
        { status: 200 }
      );
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const content = await resolveAgentPersonaScheduleContent(
      {
        postMode: "agent_persona_updates",
        lookbackHours: 24,
        mediaUrlByPlatform: {
          twitter: "/campaigns/agent-persona/morning-card.png",
          linkedin: "/campaigns/agent-persona/evening-card.png",
        },
      },
      ["twitter", "linkedin"],
      new Date("2026-04-14T13:00:00.000Z")
    );

    assert.ok(content);
    assert.match(content.contentByPlatform.twitter, /Agent Persona Apr 14:/);
    assert.match(
      content.contentByPlatform.twitter,
      /opened PR in personas pipeline: feat\(crawler\): vendor feature crawler and add segmentation/
    );
    assert.match(
      content.contentByPlatform.linkedin,
      /What we shipped on Agent Persona for Tuesday, Apr 14:/
    );
    assert.match(
      content.contentByPlatform.linkedin,
      /Live site themes: Memory Is Not Identity · How to put grounded agents inside a Discord server/
    );
    // Activity lines should include source URLs
    assert.match(
      content.contentByPlatform.linkedin,
      /github\.com\/agent-persona\/personas-pipeline\/pull\/42/
    );
    // Should return dedup keys for the events used
    assert.ok(content.dedupKeys);
    assert.ok(content.dedupKeys.includes("gh-event:ev-pr-1"));
    assert.ok(content.dedupKeys.includes("gh-event:ev-issue-1"));
    assert.equal(
      content.mediaUrlByPlatform.twitter,
      "https://social.maxpetrusenko.com/campaigns/agent-persona/morning-card.png"
    );
    assert.equal(
      content.mediaUrlByPlatform.linkedin,
      "https://social.maxpetrusenko.com/campaigns/agent-persona/evening-card.png"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = originalAppUrl;
    }
  }
});

test("renderAgentPersonaScheduleContent reuses loaded context but still shifts daily copy", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls += 1;
    const url = String(input);

    if (url === "https://agent-persona.org/") {
      return new Response(
        `
        <html>
          <head>
            <title>Persona6 | Grounded AI personas for live products</title>
            <meta name="description" content="Grounded AI personas for live products.">
          </head>
        </html>
        `,
        { status: 200 }
      );
    }

    if (url.includes("/orgs/agent-persona/events")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    if (url.includes("/repos/agent-persona/personas-pipeline")) {
      return new Response(
        JSON.stringify({
          html_url: "https://github.com/agent-persona/personas-pipeline",
          stargazers_count: 42,
        }),
        { status: 200 }
      );
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const context = await loadAgentPersonaScheduleContext({
      postMode: "agent_persona_updates",
    });

    assert.ok(context);
    assert.equal(fetchCalls, 3);

    const april14 = await renderAgentPersonaScheduleContent(
      context,
      ["twitter"],
      new Date("2026-04-14T13:00:00.000Z"),
      { usedEventIds: new Set() }
    );
    const april15 = await renderAgentPersonaScheduleContent(
      context,
      ["twitter"],
      new Date("2026-04-15T13:00:00.000Z"),
      { usedEventIds: new Set() }
    );

    assert.match(april14.contentByPlatform.twitter, /Agent Persona Apr 14:/);
    assert.match(april15.contentByPlatform.twitter, /Agent Persona Apr 15:/);
    assert.notEqual(
      april14.contentByPlatform.twitter,
      april15.contentByPlatform.twitter
    );
    assert.equal(fetchCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
