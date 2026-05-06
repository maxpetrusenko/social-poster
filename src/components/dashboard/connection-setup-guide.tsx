"use client";

import { Copy, ExternalLink, Info, X } from "lucide-react";
import { useState } from "react";
import type {
  ConnectionMethod,
  ConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import type { NativeConnectionAvailability } from "@/lib/providers/env-availability";

const X_TUTORIAL_URL = "https://www.youtube.com/watch?v=UAr2AqwHi1Q";
const X_USE_CASE_TEXT =
  "Our application enables users to schedule and publish text and media content to their own Twitter accounts using their personal API credentials. We access user profile data, publish tweets with media attachments, retrieve engagement metrics, and manage authentication.";

export function ConnectionSetupGuideButton({
  definition,
  method,
  callbackUrl,
  availability,
}: {
  definition: ConnectionPlatformDefinition;
  method: ConnectionMethod;
  callbackUrl: string | null;
  availability?: NativeConnectionAvailability;
}) {
  const [open, setOpen] = useState(false);
  const redirectUris = getLocalRedirectUriVariants(callbackUrl);
  const guide = buildSetupGuide(
    definition,
    method,
    callbackUrl,
    redirectUris,
    availability
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${definition.label}: setup guide`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(33,25,19,0.1)] bg-white text-[#5e4e42] transition hover:border-[rgba(15,126,169,0.28)] hover:text-[var(--accent-tech)]"
      >
        <Info className="h-4 w-4" />
        <span className="sr-only">{definition.label} setup guide</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(17,17,17,0.56)] px-4 py-6">
          <section className="max-h-[min(760px,calc(100vh-2rem))] w-full max-w-[640px] overflow-y-auto rounded-[18px] border border-[rgba(33,25,19,0.14)] bg-[#fffaf2] p-6 shadow-[0_28px_90px_rgba(17,17,17,0.28)]">
            <header className="flex items-start justify-between gap-5">
              <div>
                <h3 className="text-[1.45rem] font-semibold leading-tight text-[#211913]">
                  {guide.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#746253]">
                  {guide.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(33,25,19,0.12)] text-[#5e4e42]"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close setup guide</span>
              </button>
            </header>

            <div className="mt-6 space-y-5">
              <section>
                <div className="flex flex-wrap items-center gap-2">
                  {guide.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(33,25,19,0.1)] bg-white px-3 py-1.5 text-xs font-semibold text-[#4d3f34]"
                    >
                      {link.label}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-[#211913]">
                  {guide.stepsTitle}
                </h4>
                <ol className="mt-3 space-y-2 text-sm leading-6 text-[#4d3f34]">
                  {guide.steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0e5d5] text-xs font-semibold text-[#7a6756]">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {guide.useCaseText ? (
                <CopyBox
                  label="Use case text"
                  value={guide.useCaseText}
                  multiline
                />
              ) : null}

              {guide.permissions.length ? (
                <section>
                  <h4 className="text-sm font-semibold text-[#211913]">
                    Required permissions
                  </h4>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[#4d3f34]">
                    {guide.permissions.map((permission) => (
                      <li key={permission}>{permission}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {redirectUris.map((redirectUri, index) => (
                <CopyBox
                  key={redirectUri}
                  label={
                    redirectUris.length > 1
                      ? `Redirect URI ${index + 1}`
                      : "Redirect URI"
                  }
                  value={redirectUri}
                />
              ))}

              {guide.missing.length ? (
                <section className="rounded-[16px] border border-[#ead7a7] bg-[#fff5da] p-4 text-sm leading-6 text-[#89661b]">
                  <h4 className="font-semibold text-[#211913]">Missing env</h4>
                  <ul className="mt-2 space-y-1">
                    {guide.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-[16px] border border-[#e5c7ba] bg-[#f8e8e1] p-4 text-sm leading-6 text-[#9a5947]">
                <h4 className="font-semibold text-[#211913]">Security notice</h4>
                <p className="mt-1">
                  Store app credentials only in server env or encrypted credential
                  storage. Never paste API keys into chat, public docs, or client-side
                  fields.
                </p>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function CopyBox({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#211913]">{label}</h4>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(33,25,19,0.1)] px-2.5 py-1 text-xs font-semibold text-[#5e4e42]"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>
      <code
        className={`mt-3 block overflow-x-auto rounded-[12px] border border-[rgba(33,25,19,0.08)] bg-[#fcfbf8] px-3 py-2 text-xs leading-5 text-[#211913] ${
          multiline ? "whitespace-pre-wrap" : "whitespace-nowrap"
        }`}
      >
        {value}
      </code>
    </section>
  );
}

function buildSetupGuide(
  definition: ConnectionPlatformDefinition,
  method: ConnectionMethod,
  callbackUrl: string | null,
  redirectUris: string[],
  availability?: NativeConnectionAvailability
) {
  if (definition.type === "twitter" && method.authType === "oauth") {
    return {
      title: "X (Twitter) app configuration",
      subtitle:
        "Register the callback URL and app permissions before users connect.",
      stepsTitle: "How to configure the app",
      links: [
        { label: "Watch video tutorial", url: X_TUTORIAL_URL },
        { label: "Twitter Developer Portal", url: "https://developer.x.com/en/portal/dashboard" },
      ],
      steps: [
        "Open the X Developer Portal app used by Social Poster.",
        "Open User authentication settings.",
        "Set app permissions to Read and write.",
        "Set app type to Web App, Automated App or Bot.",
        "Keep DM permissions off unless the app has already been approved for DM access.",
        redirectUris.length > 1
          ? "Add the local Redirect URI below exactly. For HTTPS local development, Social Poster uses an X-only HTTP bridge because X expects local callbacks on 127.0.0.1."
          : "Add the Redirect URI below exactly. For HTTPS local development, Social Poster uses an X-only HTTP bridge because X expects local callbacks on 127.0.0.1.",
        "Keep the HTTPS Social Poster tab open at https://127.0.0.1:3000; the bridge only receives X's callback and forwards it back to the HTTPS app.",
        "Save changes, then connect X again.",
      ],
      permissions: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      useCaseText: X_USE_CASE_TEXT,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  if (definition.type === "facebook" && method.authType === "oauth") {
    return {
      title: "Facebook app configuration",
      subtitle:
        "Meta blocks OAuth when the redirect URI is not whitelisted or the app is not cleared for the requested permissions.",
      stepsTitle: "How to get credentials",
      links: method.docs.length
        ? method.docs
        : [
            {
              label: "Facebook Login setup",
              url: "https://developers.facebook.com/docs/facebook-login/",
            },
          ],
      steps: [
        "Open Meta Developers and select the app used by Social Poster.",
        "In Settings > Basic, set App Domains to social.maxpetrusenko.com and maxpetrusenko.com.",
        "In Settings > Basic, set Website URL to https://social.maxpetrusenko.com/.",
        "In Settings > Basic, set Privacy Policy URL to https://social.maxpetrusenko.com/privacy.",
        "In Settings > Basic, set Terms of Service URL to https://social.maxpetrusenko.com/terms.",
        "Confirm App Purpose, category, contact email, and app icon are filled in, then save Basic settings.",
        "Open Facebook Login, then Settings.",
        "Turn Client OAuth Login on.",
        "Turn Web OAuth Login on.",
        callbackUrl
          ? "Paste the Redirect URI below into Valid OAuth Redirect URIs exactly as shown."
          : "Paste this app's callback URL into Valid OAuth Redirect URIs exactly as shown.",
        "Also add the app domain, for example social.maxpetrusenko.com, in the app's domain settings.",
        "In App Review > Permissions and Features, make sure public_profile has Advanced Access and there is no pending Data Use Checkup.",
        "Request only the Page permissions listed below until comments or inbox features are app-reviewed.",
        "Save changes, then return here and connect Facebook again.",
      ],
      permissions: [
        "public_profile",
        "pages_show_list",
        "pages_manage_posts",
        "pages_read_engagement",
      ],
      useCaseText: null,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  if (
    (definition.type === "instagram" ||
      definition.type === "instagram_personal") &&
    method.authType === "oauth"
  ) {
    return {
      title: `${definition.label} app configuration`,
      subtitle:
        "Instagram direct OAuth uses the Instagram Platform app credentials and only works for Business or Creator accounts.",
      stepsTitle: "How to configure Instagram OAuth",
      links: method.docs.length
        ? method.docs
        : [
            {
              label: "Meta app dashboard",
              url: "https://developers.facebook.com/apps/",
            },
          ],
      steps: [
        "Open Meta Developers and select the Instagram Platform app matching PLATFORM_INSTAGRAM_APP_ID.",
        "Enable the Instagram Platform product and confirm the OAuth redirect URI is allowed.",
        callbackUrl
          ? "Paste the Redirect URI below into the Instagram app OAuth redirect settings exactly as shown."
          : "Paste this app's callback URL into the Instagram app OAuth redirect settings exactly as shown.",
        "Use a Business or Creator Instagram account. Default personal accounts cannot grant these permissions.",
        "For default personal accounts, use the Managed relay method instead of direct OAuth.",
        "Save changes, restart the dev server if env changed, then connect Instagram again.",
      ],
      permissions: [
        "instagram_business_basic",
        "instagram_business_content_publish",
        "instagram_business_manage_comments",
        "instagram_business_manage_messages",
        "instagram_business_manage_insights",
      ],
      useCaseText: null,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  if (
    (definition.type === "linkedin_personal" ||
      definition.type === "linkedin_company") &&
    method.authType === "oauth"
  ) {
    return {
      title: `${definition.label} OAuth connection`,
      subtitle:
        "Uses the configured LinkedIn developer app. The user only signs in and approves account access.",
      stepsTitle: "How this connects",
      links: method.docs.length
        ? method.docs
        : [
            {
              label: "LinkedIn developer apps",
              url: "https://www.linkedin.com/developers/apps",
            },
          ],
      steps: [
        "Keep LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in server env or encrypted credential storage.",
        redirectUris.length > 1
          ? "Register both local Redirect URIs below in the LinkedIn app OAuth settings so localhost and 127.0.0.1 both work."
          : callbackUrl
            ? "Register the Redirect URI below in the LinkedIn app OAuth settings."
          : "Register this app's LinkedIn callback URL in the LinkedIn app OAuth settings.",
        "When a workspace manager clicks Connect, this app redirects to LinkedIn for member authorization.",
        "The callback stores the account-bound token. Users never paste LinkedIn app keys.",
      ],
      permissions:
        definition.type === "linkedin_personal"
          ? ["openid", "profile", "email", "w_member_social"]
          : [
              "openid",
              "profile",
              "email",
              "w_member_social",
              "w_organization_social",
              "r_organization_social",
              "rw_organization_admin",
            ],
      useCaseText: null,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  if (
    (definition.type === "youtube" || definition.type === "google_business") &&
    method.authType === "oauth"
  ) {
    return {
      title: `${definition.label} Google OAuth configuration`,
      subtitle:
        "Google rejects OAuth when the authorized redirect URI does not exactly match the URI this app sends.",
      stepsTitle: "How to fix redirect_uri_mismatch",
      links: method.docs.length
        ? method.docs
        : [
            {
              label: "Google credentials console",
              url: "https://console.cloud.google.com/apis/credentials",
            },
          ],
      steps: [
        "Open Google Cloud Console and select the project that owns this OAuth client.",
        "Open APIs & Services, then Credentials.",
        "Open the OAuth 2.0 Client ID used by this app.",
        "Under Authorized redirect URIs, add the Redirect URI shown below exactly.",
        redirectUris.length > 1
          ? "For local dev, add both local Redirect URI variants below so localhost and 127.0.0.1 both work."
          : "For local dev, make sure the host, port, protocol, and path all match exactly.",
        "Save changes, wait a minute for Google to apply them, then connect again.",
      ],
      permissions: inferGenericPermissions(definition.type),
      useCaseText: null,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  if (definition.type === "pinterest" && method.authType === "oauth") {
    return {
      title: "Pinterest app configuration",
      subtitle:
        "Pinterest OAuth stays deactivated until the app has a Pinterest client ID and secret in env.",
      stepsTitle: "How to enable Pinterest OAuth",
      links: method.docs.length
        ? method.docs
        : [
            {
              label: "Pinterest app dashboard",
              url: "https://developers.pinterest.com/apps/",
            },
          ],
      steps: [
        "Create or open the Pinterest app used by Social Poster.",
        "Copy the app Client ID and Client Secret into .env.local.",
        "Use either PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET or PLATFORM_PINTEREST_APP_ID / PLATFORM_PINTEREST_APP_SECRET.",
        callbackUrl
          ? "Add the Redirect URI shown below exactly in Pinterest app settings."
          : "Add the callback URL shown by this app into the Pinterest app settings.",
        "Save changes, restart the dev server, then connect Pinterest again.",
      ],
      permissions: inferGenericPermissions(definition.type),
      useCaseText: null,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  return {
    title: `${definition.label} app configuration`,
    subtitle: `Configure your own ${definition.label} app credentials for ${method.label}.`,
    stepsTitle: "How to get credentials",
    links: method.docs.length
      ? method.docs
      : [{ label: `${definition.label} developer docs`, url: "https://developers.facebook.com/docs/" }],
    steps: [
      `Open the ${definition.label} developer dashboard from the links above.`,
      "Create a new app or select an existing app.",
      "Enable the product, scopes, or APIs required for publishing.",
      "Copy the app Client ID and Client Secret into server env or encrypted credential storage.",
      callbackUrl
        ? "Add the Redirect URI below to the app OAuth settings."
        : "Add the callback URL shown by this app to the platform OAuth settings.",
      "Return here and continue the OAuth connection.",
    ],
    permissions: inferGenericPermissions(definition.type),
    useCaseText: null,
    missing: availability?.configured === false ? availability.missing : [],
  };
}

function inferGenericPermissions(type: ConnectionPlatformDefinition["type"]) {
  switch (type) {
    case "linkedin_personal":
    case "linkedin_company":
      return ["Profile read access", "Content publishing access"];
    case "instagram":
    case "instagram_personal":
    case "facebook":
    case "threads":
      return ["Profile/page read access", "Content publishing access"];
    case "tiktok":
      return ["User info basic", "Video upload or Content Posting API"];
    case "youtube":
      return ["YouTube account read access", "YouTube upload/manage videos"];
    case "pinterest":
      return ["User account read access", "Pins read/write"];
    case "google_business":
      return ["Business profile read access", "Local posts write access"];
    default:
      return [];
  }
}

function getLocalRedirectUriVariants(callbackUrl: string | null) {
  if (!callbackUrl) return [];

  const parsed = safeUrl(callbackUrl);
  if (!parsed || !isLoopbackHost(parsed.hostname)) return [callbackUrl];

  return Array.from(
    new Set(
      ["localhost", "127.0.0.1"].map((host) => {
        const next = new URL(parsed.toString());
        next.hostname = host;
        return next.toString();
      })
    )
  );
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1";
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
