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
  const guide = buildSetupGuide(definition, method, callbackUrl, availability);

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

              <section className="rounded-[16px] border border-[rgba(33,25,19,0.08)] bg-white p-4">
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
                <section className="rounded-[16px] border border-[rgba(33,25,19,0.08)] bg-white p-4">
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

              {callbackUrl ? (
                <CopyBox label="Redirect URI" value={callbackUrl} />
              ) : null}

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
    <section className="rounded-[16px] border border-[rgba(33,25,19,0.08)] bg-white p-4">
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
        callbackUrl?.startsWith("http://127.0.0.1")
          ? "Add the Redirect URI below exactly. X local development requires 127.0.0.1, not localhost."
          : "Add the Redirect URI below exactly.",
        "Save changes, then connect X again.",
      ],
      permissions: ["Read and Write tweets", "Read users"],
      useCaseText: X_USE_CASE_TEXT,
      missing: availability?.configured === false ? availability.missing : [],
    };
  }

  if (definition.type === "facebook" && method.authType === "oauth") {
    return {
      title: "Facebook app configuration",
      subtitle:
        "Meta blocks OAuth until the exact redirect URI is whitelisted.",
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
        "Open Facebook Login, then Settings.",
        "Turn Client OAuth Login on.",
        "Turn Web OAuth Login on.",
        callbackUrl
          ? "Paste the Redirect URI below into Valid OAuth Redirect URIs exactly as shown."
          : "Paste this app's callback URL into Valid OAuth Redirect URIs exactly as shown.",
        "Also add the app domain, for example social.maxpetrusenko.com, in the app's domain settings.",
        "Save changes, then return here and connect Facebook again.",
      ],
      permissions: [
        "business_management",
        "pages_show_list",
        "pages_manage_posts",
        "pages_read_engagement",
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
        callbackUrl
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
              "r_organization_admin",
            ],
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
