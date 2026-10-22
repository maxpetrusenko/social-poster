import { PLATFORM_TYPES } from "@/lib/platforms";

export type OAuthReturnNotice = { kind: "success" | "error"; message: string };

export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Connection was cancelled. No account was added.",
  invalid_state: "That connection attempt expired or did not match. Try connecting again.",
  unsupported_platform: "That platform cannot be connected this way.",
  token_rejected: "The provider rejected the sign-in. Try connecting again.",
  instagram_profile_unreadable:
    "Instagram connected, but the account profile could not be read. Nothing was saved. Try connecting again.",
  facebook_no_pages:
    "Facebook connected, but no manageable Pages were returned. Check Page access and the requested permissions.",
  instagram_personal_unavailable:
    "Instagram Personal direct OAuth is unavailable. Use Managed relay for personal accounts, or connect Instagram as a Business or Creator account.",
  instagram_local_https_required:
    "Instagram local OAuth needs HTTPS. Run npm run dev:https and open https://127.0.0.1:3000.",
  oauth_start_failed:
    "Could not start the connection. Check the OAuth setup for this platform and try again.",
  provider_error: "The provider returned an error. Try connecting again.",
  callback_failed: "Connecting the account failed. Try again.",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X",
  x: "X",
  linkedin: "LinkedIn",
  linkedin_personal: "LinkedIn",
  linkedin_company: "LinkedIn",
};

function platformLabel(value: string) {
  return (
    PLATFORM_LABELS[value] ??
    value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Success notice from `?connected=` + `?platformId=` (non-secret row id); handleByPlatformId maps row id to @handle. */
export function resolveOAuthReturnNotice(
  params: Record<string, string | undefined>,
  handleByPlatformId: Record<string, string | null | undefined> = {}
): OAuthReturnNotice | null {
  const error = params.error;
  if (error) {
    const message = Object.hasOwn(OAUTH_ERROR_MESSAGES, error)
      ? OAUTH_ERROR_MESSAGES[error]
      : OAUTH_ERROR_MESSAGES.callback_failed;
    return { kind: "error", message };
  }
  const connected = params.connected;
  if (connected && (PLATFORM_TYPES as readonly string[]).includes(connected)) {
    const label = platformLabel(connected);
    const id = params.platformId;
    const raw = id && Object.hasOwn(handleByPlatformId, id) ? handleByPlatformId[id] : null;
    const handle = raw?.replace(/^@/, "");
    return {
      kind: "success",
      message: handle ? `${label} connected as @${handle}` : `${label} connected`,
    };
  }
  return null;
}
