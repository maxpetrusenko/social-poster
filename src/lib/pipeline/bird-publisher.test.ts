import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBirdEnv,
  buildBirdMentionCommandArgs,
  classifyBirdError,
  resolveBirdCredentialsFromSource,
  splitBirdThreadContent,
} from "./bird-publisher-core.ts";

test("resolveBirdCredentials prefers dashboard credentials over env", () => {
  const previousAuthToken = process.env.X_AUTH_TOKEN;
  const previousCt0 = process.env.X_CT0;
  process.env.X_AUTH_TOKEN = "env-auth";
  process.env.X_CT0 = "env-ct0";

  try {
    const resolved = resolveBirdCredentialsFromSource(
      {
        authToken: "cfg-auth",
        ct0: "cfg-ct0",
        useInstalledBirdSession: false,
        threadLongPosts: false,
        chromeProfile: "Profile 2",
        threadChunkLimit: "240",
      }
    );

    assert.equal(resolved.authToken, "cfg-auth");
    assert.equal(resolved.ct0, "cfg-ct0");
    assert.equal(resolved.useInstalledBirdSession, false);
    assert.equal(resolved.threadLongPosts, false);
    assert.equal(resolved.chromeProfile, "Profile 2");
    assert.equal(resolved.threadChunkLimit, 240);
  } finally {
    if (previousAuthToken === undefined) {
      delete process.env.X_AUTH_TOKEN;
    } else {
      process.env.X_AUTH_TOKEN = previousAuthToken;
    }

    if (previousCt0 === undefined) {
      delete process.env.X_CT0;
    } else {
      process.env.X_CT0 = previousCt0;
    }
  }
});

test("resolveBirdCredentials accepts X env key names from dashboard config", () => {
  const resolved = resolveBirdCredentialsFromSource({
    X_AUTH_TOKEN: "cfg-x-auth",
    X_CT0: "cfg-x-ct0",
  });

  assert.equal(resolved.authToken, "cfg-x-auth");
  assert.equal(resolved.ct0, "cfg-x-ct0");
});

test("resolveBirdCredentials prefers installed Bird session over env fallback", () => {
  const previousAuthToken = process.env.X_AUTH_TOKEN;
  const previousCt0 = process.env.X_CT0;
  process.env.X_AUTH_TOKEN = "env-auth";
  process.env.X_CT0 = "env-ct0";

  try {
    const resolved = resolveBirdCredentialsFromSource({
      useInstalledBirdSession: true,
      birdProfilePath: "/tmp/chrome-profile",
    });

    assert.equal(resolved.authToken, null);
    assert.equal(resolved.ct0, null);
    assert.equal(resolved.chromeProfileDir, "/tmp/chrome-profile");
    assert.equal(resolved.threadLongPosts, true);
  } finally {
    if (previousAuthToken === undefined) {
      delete process.env.X_AUTH_TOKEN;
    } else {
      process.env.X_AUTH_TOKEN = previousAuthToken;
    }

    if (previousCt0 === undefined) {
      delete process.env.X_CT0;
    } else {
      process.env.X_CT0 = previousCt0;
    }
  }
});

test("resolveBirdCredentials falls back to env when installed Bird session is disabled", () => {
  const previousAuthToken = process.env.X_AUTH_TOKEN;
  const previousCt0 = process.env.X_CT0;
  process.env.X_AUTH_TOKEN = "env-auth";
  process.env.X_CT0 = "env-ct0";

  try {
    const resolved = resolveBirdCredentialsFromSource({
      useInstalledBirdSession: false,
    });

    assert.equal(resolved.authToken, "env-auth");
    assert.equal(resolved.ct0, "env-ct0");
    assert.equal(resolved.useInstalledBirdSession, false);
  } finally {
    if (previousAuthToken === undefined) {
      delete process.env.X_AUTH_TOKEN;
    } else {
      process.env.X_AUTH_TOKEN = previousAuthToken;
    }

    if (previousCt0 === undefined) {
      delete process.env.X_CT0;
    } else {
      process.env.X_CT0 = previousCt0;
    }
  }
});

test("splitBirdThreadContent adds numbering and keeps chunks bounded", () => {
  const content = [
    "Most AI programs are mostly branding.",
    "Gauntlet AI is different because it compresses the reps and removes the life admin so the time goes into building with AI.",
    "Austin, housing, meals, laundry, room cleaning, then build.",
    "You pay nothing. CCAT required.",
  ].join("\n\n");

  const chunks = splitBirdThreadContent(content, 90);
  assert.equal(chunks.length > 1, true);
  assert.equal(chunks[0].startsWith(`1/${chunks.length} `), true);
  assert.equal(
    chunks[chunks.length - 1].startsWith(`${chunks.length}/${chunks.length} `),
    true
  );
  assert.equal(chunks.every((chunk) => chunk.length <= 90), true);
});

test("classifyBirdError maps tweet-too-long to validation error", () => {
  assert.equal(
    classifyBirdError("Authorization: Tweet needs to be a bit shorter. (186)"),
    "validation_error"
  );
});

test("buildBirdEnv injects explicit credentials without CLI args", () => {
  const env = buildBirdEnv(
    {
      authToken: "cfg-auth",
      ct0: "cfg-ct0",
    },
    { ...process.env, PATH: "/usr/bin" }
  );

  assert.equal(env.AUTH_TOKEN, "cfg-auth");
  assert.equal(env.CT0, "cfg-ct0");
  assert.equal(env.X_AUTH_TOKEN, "cfg-auth");
  assert.equal(env.X_CT0, "cfg-ct0");
  assert.equal(env.PATH, "/usr/bin");
});

test("buildBirdEnv strips inherited env auth when explicit Bird credentials are absent", () => {
  const env = buildBirdEnv(
    {
      authToken: null,
      ct0: null,
    },
    {
      ...process.env,
      AUTH_TOKEN: "env-auth",
      CT0: "env-ct0",
      X_AUTH_TOKEN: "x-env-auth",
      X_CT0: "x-env-ct0",
      PATH: "/usr/bin",
    }
  );

  assert.equal(env.AUTH_TOKEN, undefined);
  assert.equal(env.CT0, undefined);
  assert.equal(env.X_AUTH_TOKEN, undefined);
  assert.equal(env.X_CT0, undefined);
  assert.equal(env.PATH, "/usr/bin");
});

test("buildBirdMentionCommandArgs adds explicit user for mentions", () => {
  assert.deepEqual(
    buildBirdMentionCommandArgs(["mentions", "--json"], "maxpetrusenko"),
    ["mentions", "--user", "@maxpetrusenko", "--json"]
  );
  assert.deepEqual(
    buildBirdMentionCommandArgs(["mentions", "--user", "@other", "--json"], "@maxpetrusenko"),
    ["mentions", "--user", "@other", "--json"]
  );
  assert.deepEqual(
    buildBirdMentionCommandArgs(["search", "ai", "--json"], "@maxpetrusenko"),
    ["search", "ai", "--json"]
  );
});
