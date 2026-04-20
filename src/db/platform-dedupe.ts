import type Database from "better-sqlite3";

type PlatformDbRow = {
  id: string;
  workspace_id: string | null;
  provider: string;
  type: string;
  account_id: string | null;
  enabled: number;
  created_at: number | null;
  updated_at: number | null;
};

type ScheduleTargetRow = {
  id: string;
  target_platform_ids: string | null;
};

export function collapseDuplicatePlatformConnections(sqlite: Database.Database) {
  const rows = sqlite
    .prepare(
      `SELECT id, workspace_id, provider, type, account_id, enabled, created_at, updated_at
       FROM platforms
       WHERE workspace_id IS NOT NULL
         AND account_id IS NOT NULL
         AND account_id != ''`
    )
    .all() as PlatformDbRow[];

  const groups = new Map<string, PlatformDbRow[]>();
  for (const row of rows) {
    const key = [
      row.workspace_id,
      row.provider,
      row.type,
      row.account_id,
    ].join("\u001f");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const duplicateGroups = Array.from(groups.values()).filter(
    (group) => group.length > 1
  );
  if (duplicateGroups.length === 0) return;

  const updatePostTargets = sqlite.prepare(
    "UPDATE post_targets SET platform_id = @keepId WHERE platform_id = @deleteId"
  );
  const updateReplyEvents = sqlite.prepare(
    "UPDATE reply_events SET platform_id = @keepId WHERE platform_id = @deleteId"
  );
  const updateReplyCandidates = sqlite.prepare(
    "UPDATE reply_candidates SET platform_id = @keepId WHERE platform_id = @deleteId"
  );
  const deletePlatform = sqlite.prepare("DELETE FROM platforms WHERE id = ?");
  const scheduleRows = sqlite
    .prepare(
      "SELECT id, target_platform_ids FROM schedules WHERE target_platform_ids IS NOT NULL"
    )
    .all() as ScheduleTargetRow[];
  const updateScheduleTargets = sqlite.prepare(
    "UPDATE schedules SET target_platform_ids = ? WHERE id = ?"
  );

  const collapse = sqlite.transaction(() => {
    for (const group of duplicateGroups) {
      const keep = pickPreferredPlatformDbRow(group);
      const duplicateIds = group
        .filter((row) => row.id !== keep.id)
        .map((row) => row.id);

      for (const deleteId of duplicateIds) {
        const params = { keepId: keep.id, deleteId };
        updatePostTargets.run(params);
        updateReplyEvents.run(params);
        updateReplyCandidates.run(params);
      }

      rewriteSchedulePlatformTargets(
        scheduleRows,
        new Map(duplicateIds.map((id) => [id, keep.id])),
        updateScheduleTargets
      );

      for (const deleteId of duplicateIds) {
        deletePlatform.run(deleteId);
      }
    }
  });

  collapse();
  console.log(
    `[db] collapsed ${duplicateGroups.length} duplicate platform connection group(s)`
  );
}

function pickPreferredPlatformDbRow(rows: PlatformDbRow[]) {
  return rows.reduce((preferred, row) => {
    if (row.enabled !== preferred.enabled) {
      return row.enabled ? row : preferred;
    }

    const updatedDelta =
      Number(row.updated_at ?? 0) - Number(preferred.updated_at ?? 0);
    if (updatedDelta !== 0) return updatedDelta > 0 ? row : preferred;

    const createdDelta =
      Number(row.created_at ?? 0) - Number(preferred.created_at ?? 0);
    if (createdDelta !== 0) return createdDelta > 0 ? row : preferred;

    return row.id > preferred.id ? row : preferred;
  });
}

function rewriteSchedulePlatformTargets(
  rows: ScheduleTargetRow[],
  idMap: Map<string, string>,
  updateScheduleTargets: Database.Statement<[string, string]>
) {
  for (const row of rows) {
    if (!row.target_platform_ids) continue;

    const parsed = parseJsonStringArray(row.target_platform_ids);
    if (!parsed) continue;

    const rewritten = Array.from(
      new Set(parsed.map((id) => idMap.get(id) ?? id))
    );
    if (arraysEqual(parsed, rewritten)) continue;

    updateScheduleTargets.run(JSON.stringify(rewritten), row.id);
    row.target_platform_ids = JSON.stringify(rewritten);
  }
}

function parseJsonStringArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function arraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}
