/**
 * Global kill switch. Set POSTING_ENABLED=false to stop every outbound publish
 * immediately (all publish paths go through publishPlatformTargets). Fails closed:
 * targets are reported as validation errors, so nothing is marked published.
 */
export function isPostingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.POSTING_ENABLED?.trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "off" || raw === "no");
}

export const POSTING_PAUSED_ERROR =
  "Posting is paused (POSTING_ENABLED=false). Nothing was sent.";
