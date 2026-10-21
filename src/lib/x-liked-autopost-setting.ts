import { getWorkspaceSetting } from "@/lib/workspace-settings";
import { type XLikedAutopostEnv } from "./x-liked-autopost-config";

export const X_LIKES_AUTOPOST_SETTING_KEY = "x_likes_autopost_enabled";

export type XLikedAutopostEnabledState = {
  enabled: boolean;
  source: "workspace" | "env";
  envDefault: boolean;
  override: boolean | null;
};

/** Pure resolution: a workspace override wins; the process default is X_LIKES_AUTOPUBLISH_ENABLED. */
export function resolveXLikedAutopostEnabled(
  override: string | null,
  vars: XLikedAutopostEnv = process.env
): XLikedAutopostEnabledState {
  const envDefault = vars.X_LIKES_AUTOPUBLISH_ENABLED === "true";
  if (override === "true" || override === "false") {
    return { enabled: override === "true", source: "workspace", envDefault, override: override === "true" };
  }
  return { enabled: envDefault, source: "env", envDefault, override: null };
}

export async function readXLikedAutopostEnabled(workspaceId: string, vars: XLikedAutopostEnv = process.env) {
  return resolveXLikedAutopostEnabled(await getWorkspaceSetting(workspaceId, X_LIKES_AUTOPOST_SETTING_KEY), vars);
}

/** MODE=publish stays the process-level safety switch; enablement per workspace is resolved on each sweep. */
export function isXLikedAutopostPublishMode(vars: XLikedAutopostEnv = process.env) {
  return vars.X_LIKES_AUTOPUBLISH_MODE === "publish";
}
