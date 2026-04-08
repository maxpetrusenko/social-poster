import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const PLATFORM_NAME_MAP = {
  twitter: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  reddit: "Reddit",
  pinterest: "Pinterest",
  youtube: "YouTube",
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

const legacyDir = path.resolve(
  rootDir,
  args["legacy-dir"] ?? process.env.LEGACY_SOCIAL_AGENT_DIR ?? "../social-agent"
);
const dbPath = path.resolve(
  rootDir,
  args["db"] ?? process.env.DATABASE_URL ?? "data/social-poster.db"
);
const withRemoteRuns = Boolean(args["with-remote-runs"]);
const sshTarget =
  args["ssh-target"] ?? process.env.LEGACY_SSH_TARGET ?? "max@173.249.52.27";
const sshKey = expandHome(
  args["ssh-key"] ??
    process.env.LEGACY_SSH_KEY ??
    "~/.ssh/contabo_vmi3203669_ed25519"
);
const volumeName =
  args["volume"] ?? process.env.LEGACY_SOCIAL_AGENT_VOLUME ?? "";

ensureDir(path.dirname(dbPath));

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
ensureSchema(db);

const schedule = loadLegacySchedule(legacyDir);
const remoteAccountIds =
  withRemoteRuns && volumeName
    ? loadRemoteAccountIds({ sshTarget, sshKey, volumeName })
    : {};
const remoteRuns =
  withRemoteRuns && volumeName
    ? loadRemoteRuns({ sshTarget, sshKey, volumeName })
    : [];

const importedAtMs = dateToMs(schedule._updated) ?? Date.now();
const now = new Date(importedAtMs).toISOString();
const defaultProfileId = "legacy-default-profile";
const supportedPlatforms = buildPlatforms(schedule, remoteAccountIds);
const importedSchedules = buildSchedules(schedule, defaultProfileId, supportedPlatforms);

const tx = db.transaction(() => {
  upsertProfile(db, {
    id: defaultProfileId,
    name: "Max Petrusenko",
    bio: "Default profile imported from legacy social-agent.",
    voiceId:
      process.env.CARTESIA_VOICE_ID ??
      "7270ea4d-a17a-4f21-a3da-03f2b128669d",
    faceId:
      process.env.SIMLI_FACE_ID ??
      "7bb46589-4be6-4df8-ab80-03443fb75d6f",
    tone: "professional",
    config: JSON.stringify({
      importedFrom: "legacy-social-agent",
      importedAt: now,
    }),
    isDefault: 1,
    createdAt: importedAtMs,
    updatedAt: importedAtMs,
  });

  for (const platform of supportedPlatforms) {
    upsertPlatform(db, platform);
  }

  for (const item of importedSchedules) {
    upsertSchedule(db, item);
  }

  for (const run of buildPipelineRuns(remoteRuns)) {
    upsertPipelineRun(db, run);
  }
});

tx();

const summary = {
  profile: db.prepare("select count(*) as n from profiles").get().n,
  platforms: db.prepare("select count(*) as n from platforms").get().n,
  schedules: db.prepare("select count(*) as n from schedules").get().n,
  pipelineRuns: db.prepare("select count(*) as n from pipeline_runs").get().n,
  importedRemoteRuns: remoteRuns.length,
  importedPlatforms: supportedPlatforms.length,
};

console.log(JSON.stringify(summary, null, 2));

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function expandHome(value) {
  if (!value.startsWith("~")) return value;
  return path.join(process.env.HOME ?? "", value.slice(1));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureSchema(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT,
      voice_id TEXT,
      face_id TEXT,
      tone TEXT,
      config TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      handle TEXT,
      account_id TEXT,
      provider TEXT NOT NULL DEFAULT 'zernio',
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      cron TEXT NOT NULL,
      cron_human TEXT,
      job_type TEXT NOT NULL,
      profile_id TEXT,
      target_platform_ids TEXT,
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY NOT NULL,
      schedule_id TEXT,
      post_id TEXT,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      steps TEXT,
      error TEXT,
      duration_ms INTEGER,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);
}

function loadLegacySchedule(dir) {
  const filePath = path.join(dir, "config", "schedule.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing legacy schedule at ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildPlatforms(schedule, remoteAccountIds) {
  const importedAt = dateToMs(schedule._updated) ?? Date.now();

  return Object.entries(schedule._platforms)
    .map(([legacyKey, details]) => {
      const type = mapPlatformType(legacyKey);
      if (!type) return null;

      const tools = String(details.tool ?? "")
        .split("+")
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        id: `legacy-platform-${legacyKey}`,
        name: platformName(type),
        type,
        handle: details.handle ?? null,
        accountId: remoteAccountIds[type] ?? null,
        provider: tools.includes("bird") ? "bird" : "zernio",
        config: JSON.stringify({
          importedFrom: "legacy-social-agent",
          legacyKey,
          tools,
          image: schedule._imageFormats?.[legacyKey] ?? null,
          skills: defaultSkillsForPlatform(type),
          notes: buildPlatformNotes(type, tools),
        }),
        enabled: 1,
        createdAt: importedAt,
        updatedAt: importedAt,
      };
    })
    .filter(Boolean);
}

function buildSchedules(schedule, profileId, platforms) {
  const importedAt = dateToMs(schedule._updated) ?? Date.now();
  const platformIdMap = new Map(platforms.map((item) => [item.type, item.id]));

  return schedule.jobs.map((job) => ({
    ...(() => {
      const override = getScheduleOverride(job.id);
      const targetTypes = override?.targets ?? job.targets.map((target) => mapPlatformType(target)).filter(Boolean);
      return {
        id: job.id,
        name: job.name,
        description: job.description ?? null,
        cron: job.cron,
        cronHuman: job.cronHuman ?? null,
        jobType: mapJobType(job.contentType),
        profileId,
        targetPlatformIds: JSON.stringify(
          targetTypes
            .map((target) => platformIdMap.get(target))
            .filter(Boolean)
        ),
        config: JSON.stringify({
          importedFrom: "legacy-social-agent",
          actions: job.actions ?? [],
          count: job.count ?? null,
          contentType: job.contentType ?? null,
          ...(override?.config ?? {}),
        }),
        enabled: 0,
        createdAt: importedAt,
        updatedAt: importedAt,
      };
    })(),
  }));
}

function getScheduleOverride(id) {
  switch (id) {
    case "news-dedup-morning":
      return {
        targets: ["twitter", "linkedin", "instagram", "tiktok"],
        config: { instagramVideoContentType: "reel" },
      };
    case "news-dedup-evening":
      return {
        targets: ["twitter", "linkedin", "instagram", "tiktok"],
        config: { instagramVideoContentType: "story" },
      };
    case "post-x-linkedin-11am":
    case "post-x-linkedin-1pm":
    case "post-x-linkedin-3pm":
      return {
        targets: ["twitter", "linkedin"],
      };
    default:
      return null;
  }
}

function buildPipelineRuns(rows) {
  return rows.map((row) => {
    const startedAtMs = dateToMs(row.started_at) ?? Date.now();
    const completedAtMs = dateToMs(row.completed_at);
    const durationMs =
      completedAtMs !== null
        ? completedAtMs - startedAtMs
        : null;
    const results = JSON.parse(row.results_json ?? "[]");

    return {
      id: `legacy-run-${row.id}`,
      scheduleId: row.job_id,
      trigger: row.trigger_source,
      status: row.status,
      steps: JSON.stringify(
        results.map((result) => ({
          name: `platform:${result.platform}`,
          status: mapStepStatus(result.status),
          completedAt: result.timestamp,
          error: result.error ?? undefined,
          output: {
            platform: result.platform,
            legacyStatus: result.status,
          },
        }))
      ),
      error: row.error_text ?? null,
      durationMs,
      startedAt: startedAtMs,
      completedAt: completedAtMs,
    };
  });
}

function upsertProfile(sqlite, value) {
  sqlite
    .prepare(`
      INSERT INTO profiles (
        id, name, bio, voice_id, face_id, tone, config, is_default, created_at, updated_at
      ) VALUES (
        @id, @name, @bio, @voiceId, @faceId, @tone, @config, @isDefault, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        bio = excluded.bio,
        voice_id = excluded.voice_id,
        face_id = excluded.face_id,
        tone = excluded.tone,
        config = excluded.config,
        is_default = excluded.is_default,
        updated_at = excluded.updated_at
    `)
    .run(value);
}

function upsertPlatform(sqlite, value) {
  sqlite
    .prepare(`
      INSERT INTO platforms (
        id, name, type, handle, account_id, provider, config, enabled, created_at, updated_at
      ) VALUES (
        @id, @name, @type, @handle, @accountId, @provider, @config, @enabled, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        handle = excluded.handle,
        account_id = excluded.account_id,
        provider = excluded.provider,
        config = excluded.config,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `)
    .run(value);
}

function upsertSchedule(sqlite, value) {
  sqlite
    .prepare(`
      INSERT INTO schedules (
        id, name, description, cron, cron_human, job_type, profile_id, target_platform_ids, config, enabled, created_at, updated_at
      ) VALUES (
        @id, @name, @description, @cron, @cronHuman, @jobType, @profileId, @targetPlatformIds, @config, @enabled, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        cron = excluded.cron,
        cron_human = excluded.cron_human,
        job_type = excluded.job_type,
        profile_id = excluded.profile_id,
        target_platform_ids = excluded.target_platform_ids,
        config = excluded.config,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `)
    .run(value);
}

function upsertPipelineRun(sqlite, value) {
  sqlite
    .prepare(`
      INSERT INTO pipeline_runs (
        id, schedule_id, trigger, status, steps, error, duration_ms, started_at, completed_at
      ) VALUES (
        @id, @scheduleId, @trigger, @status, @steps, @error, @durationMs, @startedAt, @completedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        schedule_id = excluded.schedule_id,
        trigger = excluded.trigger,
        status = excluded.status,
        steps = excluded.steps,
        error = excluded.error,
        duration_ms = excluded.duration_ms,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at
    `)
    .run(value);
}

function loadRemoteRuns({ sshTarget, sshKey, volumeName }) {
  const output = runSsh(
    sshTarget,
    sshKey,
    `sudo docker run --rm -v ${volumeName}:/data python:3.12-slim python -c 'import sqlite3,json; conn=sqlite3.connect("/data/social-agent.db"); conn.row_factory=sqlite3.Row; rows=[dict(row) for row in conn.execute("select * from run_logs order by id desc").fetchall()]; print(json.dumps(rows))'`
  );
  return JSON.parse(output);
}

function loadRemoteAccountIds({ sshTarget, sshKey, volumeName }) {
  const containerNames = runSsh(
    sshTarget,
    sshKey,
    `sudo docker ps --filter volume=${volumeName} --format '{{.Names}}'`
  )
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (containerNames.length === 0) {
    return {};
  }

  const envOutput = runSsh(
    sshTarget,
    sshKey,
    `sudo docker inspect ${containerNames[0]} --format '{{range .Config.Env}}{{println .}}{{end}}'`
  );
  const envMap = Object.fromEntries(
    envOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const splitIndex = line.indexOf("=");
        return [line.slice(0, splitIndex), line.slice(splitIndex + 1)];
      })
  );

  return {
    twitter: envMap.ZERNIO_TWITTER_ACCOUNT_ID ?? null,
    linkedin: envMap.ZERNIO_LINKEDIN_ACCOUNT_ID ?? null,
    instagram: envMap.ZERNIO_INSTAGRAM_ACCOUNT_ID ?? null,
    tiktok: envMap.ZERNIO_TIKTOK_ACCOUNT_ID ?? null,
    facebook: envMap.ZERNIO_FACEBOOK_ACCOUNT_ID ?? null,
    reddit: envMap.ZERNIO_REDDIT_ACCOUNT_ID ?? null,
    pinterest: envMap.ZERNIO_PINTEREST_ACCOUNT_ID ?? null,
    youtube: envMap.ZERNIO_YOUTUBE_ACCOUNT_ID ?? null,
  };
}

function runSsh(sshTarget, sshKey, remoteCommand) {
  return execFileSync(
    "ssh",
    ["-i", sshKey, "-o", "StrictHostKeyChecking=no", sshTarget, remoteCommand],
    { encoding: "utf8" }
  ).trim();
}

function platformName(type) {
  return PLATFORM_NAME_MAP[type] ?? type;
}

function mapPlatformType(value) {
  const normalized = String(value);
  if (normalized === "x") return "twitter";
  if (normalized in PLATFORM_NAME_MAP) return normalized;
  return null;
}

function mapJobType(contentType) {
  if (contentType === "video") return "avatar_video";
  if (contentType === "image+text") return "image_post";
  return "text_post";
}

function mapStepStatus(status) {
  if (status === "success" || status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "skipped") return "skipped";
  return "completed";
}

function buildPlatformNotes(type, tools) {
  if (type === "twitter") {
    return "Legacy X path used bird for posting and zernio as fallback.";
  }
  if (tools.length > 0) {
    return `Imported from legacy social-agent tooling: ${tools.join(", ")}.`;
  }
  return "Imported from legacy social-agent.";
}

function defaultSkillsForPlatform(type) {
  const skills = {
    twitter: ["hooks", "short-form copy", "thread followups"],
    linkedin: ["professional framing", "executive POV", "link-safe captions"],
    instagram: ["visual captions", "square creative", "CTA endings"],
    tiktok: ["vertical video hooks", "caption overlays", "short scripts"],
    facebook: ["community copy", "link preview blurbs", "cross-post cleanup"],
    reddit: ["discussion-first titles", "subreddit tone", "no-sales framing"],
    pinterest: ["pin titles", "2:3 creative", "search-friendly descriptions"],
    youtube: ["shorts metadata", "headline packaging", "video descriptions"],
  };

  return skills[type] ?? [];
}

function dateToMs(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}
