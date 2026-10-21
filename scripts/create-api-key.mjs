#!/usr/bin/env node
// Mint a workspace API key without a browser session.
//
//   docker exec <container> node scripts/create-api-key.mjs \
//     --workspace <workspace-id> --name <label> [--permission read_write] [--user <user-id>]
//
// Same format and hashing as POST /api/api-keys (src/lib/api-key-mint.ts):
// sk_<64 hex>, sha256 hex hash stored, prefix/suffix kept for display.
// The raw key is written to STDOUT only (pipe it into a secret store);
// all diagnostics go to STDERR. The key is never logged or stored in plaintext.
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    out[arg.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

export function hashKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey() {
  return `sk_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ workspaceId: string, name: string, permission?: string, userId?: string, scope?: string }} opts
 */
export function mintApiKey(db, { workspaceId, name, permission = "read_write", userId, scope = "all" }) {
  if (!workspaceId || !name) throw new Error("--workspace and --name are required");
  if (!["read", "read_write"].includes(permission)) throw new Error("--permission must be read or read_write");

  const workspace = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId);
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

  // The key acts as its creator, so the creator must be a workspace member
  // and an org owner/admin (API-key tenants carry no workspace list, so manager
  // checks resolve through the org role) or every authenticated request would 403.
  const creatorQuery = `SELECT wm.user_id AS id FROM workspace_memberships wm
     JOIN workspaces w ON w.id = wm.workspace_id
     JOIN org_memberships om ON om.user_id = wm.user_id AND om.organization_id = w.organization_id
     WHERE wm.workspace_id = ? AND om.org_role IN ('owner','admin')`;
  const creator = userId
    ? db.prepare(`${creatorQuery} AND wm.user_id = ? LIMIT 1`).get(workspaceId, userId)
    : db.prepare(`${creatorQuery} ORDER BY wm.added_at ASC LIMIT 1`).get(workspaceId);
  if (!creator) throw new Error("No eligible creator: needs an owner/admin of the workspace's organization who is a workspace member");

  const fullKey = generateApiKey();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO api_keys (id, workspace_id, name, key_hash, key_prefix, key_suffix, scope, permission, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, workspaceId, name, hashKey(fullKey), fullKey.slice(0, 10), fullKey.slice(-6), scope, permission, creator.id, Math.floor(Date.now() / 1000));

  return { id, key: fullKey, name, scope, permission, createdBy: creator.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(process.env.DATABASE_URL ?? "./data/social-poster.db");
  db.pragma("busy_timeout = 5000");
  try {
    const result = mintApiKey(db, {
      workspaceId: args.workspace,
      name: args.name,
      permission: args.permission ?? "read_write",
      userId: args.user,
    });
    process.stderr.write(`created api key id=${result.id} name=${result.name} permission=${result.permission} createdBy=${result.createdBy}\n`);
    process.stdout.write(result.key);
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
