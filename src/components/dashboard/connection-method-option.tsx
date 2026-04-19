import { useState, useRef, useEffect } from "react";
import { Check, Info } from "lucide-react";
import type {
  ConnectionMethod,
  ConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import type { NativeConnectionAvailability } from "@/lib/providers/env-availability";
import type { PlatformType } from "@/lib/platforms";
import { ConnectionSetupGuideButton } from "./connection-setup-guide";

export function ConnectionMethodOption({
  method,
  definition,
  active,
  deactivated,
  onSelect,
  onConnect,
  callbackUrl,
  availability,
  clientId,
  clientSecret,
  onCredentialChange,
}: {
  method: ConnectionMethod;
  definition: ConnectionPlatformDefinition;
  active: boolean;
  deactivated: boolean;
  onSelect: () => void;
  onConnect: () => void;
  callbackUrl: string | null;
  availability?: NativeConnectionAvailability;
  clientId: string;
  clientSecret: string;
  onCredentialChange: (
    key: "clientId" | "clientSecret",
    value: string
  ) => void;
}) {
  const appManagedOAuth = isAppManagedOAuthPlatform(
    definition.type,
    availability
  );
  const appManagedCopy = getAppManagedOAuthCopy(definition.type);
  const hasInlineCredentials =
    !appManagedOAuth && Boolean(clientId && clientSecret);
  const canStartOAuth =
    method.authType === "oauth" && (!deactivated || hasInlineCredentials);
  const handleSelect = () => {
    if (method.authType === "oauth" && appManagedOAuth && canStartOAuth) {
      onSelect();
      onConnect();
      return;
    }

    onSelect();
  };

  return (
    <div
      className={`rounded-[14px] border px-3 py-3 ${
        active && !deactivated
          ? "border-[rgba(15,126,169,0.28)] bg-[rgba(15,126,169,0.06)]"
          : "border-[rgba(33,25,19,0.08)] bg-[rgba(248,244,235,0.72)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <button
            type="button"
            onClick={handleSelect}
            className="min-w-0 flex-1 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-[#211913]">{method.label}</p>
              <p className="mt-1 text-xs leading-5 text-[#746253]">
                {method.description}
              </p>
            </div>
          </button>
          {method.infoTooltip ? (
            <MethodInfoTooltip tooltip={method.infoTooltip} />
          ) : null}
        </div>
        {deactivated ? (
          <span className="rounded-full border border-[#ead7a7] bg-[#fff5da] px-2.5 py-1 text-xs font-semibold text-[#89661b]">
            Missing env
          </span>
        ) : active ? (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(15,126,169,0.14)] text-[var(--accent-tech)]">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {active && method.authType === "oauth" ? (
        <div className="mt-3 space-y-3 rounded-[12px] border border-[rgba(33,25,19,0.08)] bg-white/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a6756]">
              {appManagedOAuth ? "Account authorization" : "App credentials"}
            </p>
            <ConnectionSetupGuideButton
              definition={definition}
              method={method}
              callbackUrl={callbackUrl}
              availability={availability}
            />
          </div>
          {appManagedOAuth ? (
            <p className="text-sm leading-6 text-[#4d3f34]">
              Uses the configured {appManagedCopy.appLabel} app. Users sign in
              and approve access; no app keys are needed here.
            </p>
          ) : (
            <>
              <CredentialInput
                label="Client ID"
                value={clientId}
                onChange={(value) => onCredentialChange("clientId", value)}
              />
              <CredentialInput
                label="Client secret"
                type="password"
                value={clientSecret}
                onChange={(value) => onCredentialChange("clientSecret", value)}
              />
            </>
          )}
          <button
            type="button"
            onClick={onConnect}
            disabled={!canStartOAuth}
            className="inline-flex w-full items-center justify-center rounded-[12px] bg-[#121d2e] px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
          >
            {appManagedOAuth ? `Connect ${definition.label}` : "Connect"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CredentialInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a6756]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-[12px] border border-[rgba(33,25,19,0.12)] bg-white px-3 py-2 text-sm text-[#211913]"
      />
    </label>
  );
}

export function OAuthSetupPanel({
  availability,
  callbackUrl,
  deactivated,
}: {
  availability: NativeConnectionAvailability | undefined;
  callbackUrl: string | null;
  deactivated: boolean;
}) {
  return (
    <div
      className={`rounded-[14px] border px-3 py-3 text-sm leading-6 ${
        deactivated
          ? "border-[#ead7a7] bg-[#fff5da] text-[#89661b]"
          : "border-[rgba(33,25,19,0.08)] bg-[#fcfbf8] text-[#4d3f34]"
      }`}
    >
      <p className="font-semibold text-[#211913]">OAuth app setup</p>
      <p className="mt-1">
        Client ID and client secret are server app credentials. Users only click
        Connect to grant account permissions.
      </p>
      {deactivated ? (
        <div className="mt-3 rounded-[12px] bg-white/65 px-3 py-2">
          <p className="font-semibold">Missing env</p>
          <ul className="mt-1 list-inside list-disc">
            {(availability?.missing ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 font-semibold text-[#2f7b4f]">
          App credentials configured.
        </p>
      )}
      {callbackUrl ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a6756]">
            Callback URL
          </p>
          <code className="mt-1 block overflow-x-auto rounded-[10px] border border-[rgba(33,25,19,0.08)] bg-white px-3 py-2 text-xs text-[#211913]">
            {callbackUrl}
          </code>
        </div>
      ) : null}
      {hasCallbackOriginMismatch(callbackUrl) ? (
        <p className="mt-3 rounded-[10px] border border-[#ead7a7] bg-[#fff8e3] px-3 py-2 text-xs font-semibold text-[#89661b]">
          This provider only accepts the callback domain above. Open that domain
          to connect OAuth accounts.
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[#7a6756]">
        For X manual API keys or user tokens, choose the API keys method above.
      </p>
    </div>
  );
}

export function getBrowserOAuthCallbackUrl(
  platformType: PlatformType,
  oauthCallbackUrlOverride: string | null
) {
  if (typeof window === "undefined") return null;
  if (oauthCallbackUrlOverride) return oauthCallbackUrlOverride;
  return `${window.location.origin}${getOAuthCallbackPath(platformType)}`;
}

export function isAppManagedOAuthPlatform(
  platformType: PlatformType,
  availability?: NativeConnectionAvailability
) {
  return (
    availability?.configured === true ||
    platformType === "facebook" ||
    platformType === "twitter" ||
    platformType === "linkedin" ||
    platformType === "linkedin_personal" ||
    platformType === "linkedin_company"
  );
}

function getAppManagedOAuthCopy(platformType: PlatformType) {
  if (
    platformType === "facebook" ||
    platformType === "instagram" ||
    platformType === "instagram_personal" ||
    platformType === "threads"
  ) {
    return { appLabel: "Meta" };
  }

  if (platformType === "tiktok") {
    return { appLabel: "TikTok" };
  }

  if (platformType === "youtube" || platformType === "google_business") {
    return { appLabel: "Google" };
  }

  if (platformType === "pinterest") {
    return { appLabel: "Pinterest" };
  }

  if (platformType === "twitter") {
    return { appLabel: "X" };
  }

  return { appLabel: "LinkedIn" };
}

function MethodInfoTooltip({
  tooltip,
}: {
  tooltip: NonNullable<ConnectionMethod["infoTooltip"]>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#7a6756] hover:bg-[rgba(33,25,19,0.08)]"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-[12px] border border-[rgba(33,25,19,0.12)] bg-white p-3 shadow-lg">
          <p className="text-xs font-semibold text-[#211913]">{tooltip.title}</p>
          <ul className="mt-2 space-y-1">
            {tooltip.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-1.5 text-xs leading-5 text-[#4d3f34]"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#7a6756]" />
                {bullet}
              </li>
            ))}
          </ul>
          {tooltip.learnMoreUrl ? (
            <a
              href={tooltip.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-xs font-semibold text-[var(--accent-tech)] hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              Learn more
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function hasCallbackOriginMismatch(callbackUrl: string | null) {
  if (!callbackUrl || typeof window === "undefined") return false;
  try {
    return new URL(callbackUrl).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function getOAuthCallbackPath(platformType: PlatformType) {
  void platformType;
  return "/api/auth/callback";
}
