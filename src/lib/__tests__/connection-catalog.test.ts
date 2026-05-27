import { describe, expect, it } from "vitest";

import { CONNECTION_PLATFORM_DEFINITIONS } from "@/lib/connection-catalog";
import { defaultAuthStrategy, usesRedirectCallback } from "@/lib/oauth/auth-strategy";
import { getProvider, hasNativeProvider } from "@/lib/providers/registry";

const REDIRECT_URI = "https://social.maxpetrusenko.com/api/auth/callback";
const LOCAL_REDIRECT_URI = "https://127.0.0.1:3000/api/auth/callback";
const STATE = "signed-state";
const CODE_VERIFIER = "code-verifier";

const providerCredentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  client_key: "client-id",
  client_secret: "client-secret",
  appId: "client-id",
  appSecret: "client-secret",
};

describe("connection catalog", () => {
  it("has a stable connection definition and method for every catalog entry", () => {
    const seenTypes = new Set<string>();
    const seenMethodIds = new Set<string>();

    for (const definition of CONNECTION_PLATFORM_DEFINITIONS) {
      expect(definition.type, definition.label).toBeTruthy();
      expect(definition.label, definition.type).toBeTruthy();
      expect(definition.methods.length, definition.type).toBeGreaterThan(0);
      expect(seenTypes.has(definition.type), definition.type).toBe(false);
      seenTypes.add(definition.type);

      for (const method of definition.methods) {
        expect(method.id, definition.type).toBeTruthy();
        expect(method.label, method.id).toBeTruthy();
        expect(method.provider, method.id).toMatch(/^(direct|zernio|bird)$/);
        expect(method.authType, method.id).toMatch(/^(manual|oauth)$/);
        expect(
          method.authStrategy ?? defaultAuthStrategy(method.authType),
          method.id
        ).toBeTruthy();
        expect(method.description, method.id).toBeTruthy();
        expect(method.recommendation, method.id).toBeTruthy();
        expect(seenMethodIds.has(method.id), method.id).toBe(false);
        seenMethodIds.add(method.id);
      }
    }
  });

  it("keeps every direct OAuth connection backed by a native provider", () => {
    const oauthMethods = CONNECTION_PLATFORM_DEFINITIONS.flatMap((definition) =>
      definition.methods
        .filter(
          (method) =>
            method.provider === "direct" &&
            usesRedirectCallback(
              method.authStrategy ?? defaultAuthStrategy(method.authType)
            )
        )
        .map((method) => ({ definition, method }))
    );

    expect(oauthMethods.length).toBeGreaterThan(0);

    for (const { definition, method } of oauthMethods) {
      expect(hasNativeProvider(definition.type), method.id).toBe(true);

      const provider = getProvider(definition.type, providerCredentials);
      const authUrl = new URL(
        provider.getAuthUrl(REDIRECT_URI, STATE, CODE_VERIFIER)
      );

      expect(authUrl.searchParams.get("redirect_uri"), method.id).toBe(
        REDIRECT_URI
      );
      expect(authUrl.searchParams.get("state"), method.id).toBe(STATE);
      expect(
        authUrl.searchParams.has("force_authentication"),
        method.id
      ).toBe(false);
    }
  });

  it("keeps every direct OAuth provider happy on local HTTPS callbacks", () => {
    const oauthMethods = CONNECTION_PLATFORM_DEFINITIONS.flatMap((definition) =>
      definition.methods
        .filter(
          (method) =>
            method.provider === "direct" &&
            usesRedirectCallback(
              method.authStrategy ?? defaultAuthStrategy(method.authType)
            )
        )
        .map((method) => ({ definition, method }))
    );

    expect(oauthMethods.length).toBeGreaterThan(0);

    for (const { definition, method } of oauthMethods) {
      const provider = getProvider(definition.type, providerCredentials);
      const authUrl = new URL(
        provider.getAuthUrl(LOCAL_REDIRECT_URI, STATE, CODE_VERIFIER)
      );

      expect(authUrl.searchParams.get("redirect_uri"), method.id).toBe(
        LOCAL_REDIRECT_URI
      );
      expect(authUrl.searchParams.get("state"), method.id).toBe(STATE);
    }
  });

  it("keeps OAuth account selection stable across mobile and desktop browsers", () => {
    const instagram = authUrlFor("instagram");
    expect(instagram.searchParams.get("enable_fb_login")).toBe("0");
    expect(instagram.searchParams.has("force_reauth")).toBe(false);

    for (const platform of ["google_business", "youtube"]) {
      const url = authUrlFor(platform);
      expect(url.searchParams.get("access_type"), platform).toBe("offline");
      expect(url.searchParams.get("include_granted_scopes"), platform).toBe(
        "true"
      );
      expect(url.searchParams.has("prompt"), platform).toBe(false);
    }
  });
});

function authUrlFor(platform: string) {
  const provider = getProvider(platform, providerCredentials);
  return new URL(provider.getAuthUrl(REDIRECT_URI, STATE, CODE_VERIFIER));
}
