export const INSTAGRAM_PERSONAL_DIRECT_OAUTH_DISABLED =
  "Instagram Personal direct OAuth is unavailable. Use Managed relay for personal accounts, or connect Instagram as a Business or Creator account.";

export function getDisabledNativeOAuthMessage(platform: string) {
  if (platform === "instagram_personal") {
    return INSTAGRAM_PERSONAL_DIRECT_OAUTH_DISABLED;
  }
  return null;
}
