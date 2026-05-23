import { describe, expect, it } from "vitest";

import {
  getPlatformCapabilities,
  getPlatformCapabilityGraph,
} from "../platform-capabilities.ts";

describe("platform capability graph", () => {
  it("keeps legacy publishing behavior while exposing graph entries", () => {
    const capabilities = getPlatformCapabilities({
      provider: "bird",
      type: "twitter",
      config: null,
    });

    expect(capabilities.canPublishText).toBe(true);
    expect(capabilities.canPublishImage).toBe(true);
    expect(capabilities.canPublishVideo).toBe(true);
    expect(capabilities.canPublishReply).toBe(true);
    expect(capabilities.canPublishThread).toBe(true);
    expect(capabilities.canPublishLongText).toBe(false);
    expect(capabilities.graph["publish.long_text"]).toEqual(
      expect.objectContaining({
        status: "unknown",
        confidence: "provider_default",
      })
    );
  });

  it("reads account-specific capabilities from platform config", () => {
    const graph = getPlatformCapabilityGraph({
      provider: "bird",
      type: "twitter",
      config: {
        capabilities: {
          canPublishText: true,
          canPublishImage: true,
          canPublishVideo: false,
          canPublishReply: true,
          canPublishThread: true,
          canPublishLongText: true,
        },
      },
    });

    expect(graph["publish.video"].status).toBe("unsupported");
    expect(graph["publish.long_text"]).toEqual(
      expect.objectContaining({
        status: "supported",
        confidence: "config",
      })
    );
  });
});
