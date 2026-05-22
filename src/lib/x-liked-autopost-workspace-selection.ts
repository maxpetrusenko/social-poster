export type XLikedAutopostWorkspacePlatform = {
  workspaceId: string | null;
  platformType: string;
  provider: string;
  enabled: boolean;
};

export function parseXLikedAutopostWorkspaceIds(value?: string | null) {
  const raw =
    value ??
    process.env.X_LIKES_AUTOPUBLISH_WORKSPACE_IDS ??
    process.env.X_LIKES_AUTOPUBLISH_WORKSPACE_ID ??
    "";

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function isBirdXPlatform(row: XLikedAutopostWorkspacePlatform) {
  return (
    row.enabled &&
    row.provider.toLowerCase() === "bird" &&
    ["x", "twitter"].includes(row.platformType.toLowerCase())
  );
}

function isLinkedInPersonalPlatform(row: XLikedAutopostWorkspacePlatform) {
  return row.enabled && row.platformType.toLowerCase() === "linkedin_personal";
}

export function selectXLikedAutopostWorkspaceIds(
  rows: XLikedAutopostWorkspacePlatform[],
  configuredIds = parseXLikedAutopostWorkspaceIds()
) {
  if (configuredIds.length > 0) return configuredIds;

  const byWorkspace = new Map<string, XLikedAutopostWorkspacePlatform[]>();
  for (const row of rows) {
    if (!row.workspaceId) continue;
    byWorkspace.set(row.workspaceId, [...(byWorkspace.get(row.workspaceId) ?? []), row]);
  }

  return Array.from(byWorkspace)
    .filter(([, workspaceRows]) => {
      return (
        workspaceRows.some(isBirdXPlatform) &&
        workspaceRows.some(isLinkedInPersonalPlatform)
      );
    })
    .map(([workspaceId]) => workspaceId);
}
