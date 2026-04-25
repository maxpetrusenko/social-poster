import Database from "better-sqlite3";

import { hydrateScheduleConfigMedia } from "@/lib/schedule-media";

type ScheduleRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  config: string | null;
};

async function main() {
  const sqlite = new Database("data/social-poster.db");
  const rows = sqlite
    .prepare(
      `
        select id, workspace_id, name, config
        from schedules
        where config is not null
      `
    )
    .all() as ScheduleRow[];

  const updated: string[] = [];
  const unchanged: string[] = [];
  const failed: Array<{ id: string; name: string; error: string }> = [];

  for (const row of rows) {
    if (!row.workspace_id || !row.config) {
      unchanged.push(row.id);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.config);
    } catch {
      failed.push({
        id: row.id,
        name: row.name,
        error: "Invalid JSON config",
      });
      continue;
    }

    try {
      const hydrated = await hydrateScheduleConfigMedia(parsed, {
        workspaceId: row.workspace_id,
        scheduleId: row.id,
        strict: false,
      });
      const nextConfig = JSON.stringify(hydrated);
      if (nextConfig === row.config) {
        unchanged.push(row.id);
        continue;
      }

      sqlite
        .prepare(
          `
            update schedules
            set config = ?, updated_at = ?
            where id = ?
          `
        )
        .run(nextConfig, Date.now(), row.id);
      updated.push(row.id);
    } catch (error) {
      failed.push({
        id: row.id,
        name: row.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        updated,
        unchanged,
        failed,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
