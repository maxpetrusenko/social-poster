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

/** Success notice from `?connected=`; handle is the connected account's @handle if known. */
export function resolveOAuthReturnNotice(
  params: Record<string, string | undefined>,
  handleByPlatform: Record<string, string | null | undefined> = {}
): OAuthReturnNotice | null {
  const error = params.error;
  if (error) {
    // Known code -> human message. Legacy free-text messages are shown as-is,
    // truncated; they are already redacted at the source.
    const message = OAUTH_ERROR_MESSAGES[error] ?? error.slice(0, 300);
    return { kind: "error", message };
  }
  const connected = params.connected;
  if (connected && (PLATFORM_TYPES as readonly string[]).includes(connected)) {
    const label = platformLabel(connected);
    const handle = handleByPlatform[connected]?.replace(/^@/, "");
    return {
      kind: "success",
      message: handle ? `${label} connected as @${handle}` : `${label} connected`,
    };
  }
  return null;
}
