import { expect, test } from "vitest";

import {
  mapComposerPlatforms,
  parseComposerPlatformConfig,
} from "../dashboard/composer.ts";

test("parseComposerPlatformConfig tolerates malformed legacy config text", () => {
  expect(parseComposerPlatformConfig("{not-json")).toBeNull();
  expect(parseComposerPlatformConfig(null)).toBeNull();
  expect(parseComposerPlatformConfig("[]")).toBeNull();
  expect(parseComposerPlatformConfig('{"capabilities":["text"]}')).toEqual({
    capabilities: ["text"],
  });
});

test("mapComposerPlatforms dedupes enabled accounts and falls back for null config", () => {
  const now = new Date("2026-05-20T12:00:00.000Z");
  const platforms = mapComposerPlatforms([
    {
      id: "old",
      workspaceId: "workspace",
      name: "Old X",
      handle: "@max",
      type: "x",
      accountId: "x-old",
      provider: "zernio",
      enabled: true,
      config: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "new",
      workspaceId: "workspace",
      name: "Direct X",
      handle: "max",
      type: "twitter",
      accountId: "x-new",
      provider: "direct",
      enabled: true,
      config: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "disabled",
      workspaceId: "workspace",
      name: "Disabled Instagram",
      handle: "@max",
      type: "instagram",
      accountId: "ig-disabled",
      provider: "direct",
      enabled: false,
      config: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  expect(platforms).toHaveLength(1);
  expect(platforms[0]?.id).toBe("new");
  expect(platforms[0]?.capabilities.source).toBe("legacy-default");
});
