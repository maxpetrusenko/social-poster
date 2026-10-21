import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { generateApiKey, hashApiKey } from "../api-key-mint";
import { generateApiKey as cliGenerate, hashKey as cliHash, mintApiKey } from "../../../scripts/create-api-key.mjs";

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE org_memberships (user_id TEXT, org_role TEXT);
    CREATE TABLE workspace_memberships (user_id TEXT, workspace_id TEXT, workspace_role TEXT, added_at INTEGER);
    CREATE TABLE api_keys (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, key_hash TEXT, key_prefix TEXT, key_suffix TEXT,
      scope TEXT, permission TEXT, status TEXT NOT NULL DEFAULT 'active', created_by TEXT, created_at INTEGER);
    INSERT INTO workspaces VALUES ('w1');
    INSERT INTO org_memberships VALUES ('viewer','member'), ('boss','owner');
    INSERT INTO workspace_memberships VALUES ('viewer','w1','viewer',1), ('boss','w1','owner',2);
  `);
  return db;
}

describe("scripts/create-api-key.mjs", () => {
  it("matches the app's key format and hashing", () => {
    expect(cliGenerate()).toMatch(/^sk_[a-f0-9]{64}$/);
    expect(generateApiKey()).toMatch(/^sk_[a-f0-9]{64}$/);
    expect(cliHash("sk_abc")).toBe(hashApiKey("sk_abc"));
  });

  it("stores only the hash, as an active read_write key owned by an org admin", () => {
    const db = makeDb();
    const result = mintApiKey(db, { workspaceId: "w1", name: "agent" });
    const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(result.id) as Record<string, string>;
    expect(row.key_hash).toBe(hashApiKey(result.key));
    expect(row.permission).toBe("read_write");
    expect(row.status).toBe("active");
    expect(row.created_by).toBe("boss");
    expect(JSON.stringify(row)).not.toContain(result.key);
  });

  it("rejects unknown workspaces and bad permissions", () => {
    const db = makeDb();
    expect(() => mintApiKey(db, { workspaceId: "nope", name: "a" })).toThrow(/Workspace not found/);
    expect(() => mintApiKey(db, { workspaceId: "w1", name: "a", permission: "root" })).toThrow(/permission/);
  });
});
