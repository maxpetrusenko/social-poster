import { describe, expect, it } from "vitest";

import { getConnectionPlatformDefinition } from "@/lib/connection-catalog";
import { config } from "@/platforms/instagram/config";

describe("Instagram connection catalog", () => {
  it("keeps native Instagram as OAuth and not app-password auth", () => {
    const definition = getConnectionPlatformDefinition("instagram");
    const method = definition?.methods.find((item) => item.id === "instagram_oauth");

    expect(method).toMatchObject({
      label: "Connect professional Instagram",
      provider: "direct",
      authType: "oauth",
    });
    expect(method?.fields).toEqual([]);
    expect(method?.recommendation).toContain("Business or Creator");
  });

  it("keeps personal Instagram setup on managed relay with provider account id", () => {
    const definition = getConnectionPlatformDefinition("instagram");
    const method = definition?.methods.find((item) => item.provider === "zernio");

    expect(method).toMatchObject({
      label: "Managed relay account",
      authType: "manual",
    });
    expect(method?.fields.map((field) => field.id)).toContain("providerAccountId");
    expect(method?.fields.map((field) => field.label)).not.toContain("App password");
  });

  it("does not expose Instagram Personal as a direct OAuth variant", () => {
    expect(config.variants).toEqual(["instagram"]);
    expect(getConnectionPlatformDefinition("instagram_personal")).toBeUndefined();
  });
});
