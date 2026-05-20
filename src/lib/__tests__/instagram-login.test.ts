import { afterEach, describe, expect, it } from "vitest";

import { credentialsFromEnv } from "../providers/credentials.ts";
import { getProvider } from "../providers/registry.ts";

const ORIGINAL_ENV = {
  platformInstagramAppId: process.env.PLATFORM_INSTAGRAM_APP_ID,
  platformInstagramAppSecret: process.env.PLATFORM_INSTAGRAM_APP_SECRET,
  platformFacebookAppId: process.env.PLATFORM_FACEBOOK_APP_ID,
  platformFacebookAppSecret: process.env.PLATFORM_FACEBOOK_APP_SECRET,
};

describe("regular Instagram OAuth", () => {
  afterEach(() => {
    restoreEnv("PLATFORM_INSTAGRAM_APP_ID", ORIGINAL_ENV.platformInstagramAppId);
    restoreEnv(
      "PLATFORM_INSTAGRAM_APP_SECRET",
      ORIGINAL_ENV.platformInstagramAppSecret
    );
    restoreEnv("PLATFORM_FACEBOOK_APP_ID", ORIGINAL_ENV.platformFacebookAppId);
    restoreEnv(
      "PLATFORM_FACEBOOK_APP_SECRET",
      ORIGINAL_ENV.platformFacebookAppSecret
    );
  });

  it("uses Instagram Login instead of Facebook Login", () => {
    const provider = getProvider("instagram", {
      clientId: "ig-app-id",
      clientSecret: "ig-app-secret",
    });

    const url = new URL(provider.getAuthUrl("https://app.example/callback", "state"));

    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("ig-app-id");
    expect(url.searchParams.get("enable_fb_login")).toBe("0");
    expect(url.searchParams.has("force_authentication")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages,instagram_business_manage_insights"
    );
  });

  it("prefers the Instagram app env keys", () => {
    process.env.PLATFORM_INSTAGRAM_APP_ID = "ig-app-id";
    process.env.PLATFORM_INSTAGRAM_APP_SECRET = "ig-app-secret";
    process.env.PLATFORM_FACEBOOK_APP_ID = "fb-app-id";
    process.env.PLATFORM_FACEBOOK_APP_SECRET = "fb-app-secret";

    const credentials = credentialsFromEnv("instagram");

    expect(credentials.clientId).toBe("ig-app-id");
    expect(credentials.clientSecret).toBe("ig-app-secret");
    expect(credentials.appId).toBeUndefined();
    expect(credentials.appSecret).toBeUndefined();
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
