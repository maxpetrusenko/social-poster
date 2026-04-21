import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy";
import { randomUUID, createHash } from "crypto";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  const raw = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return `sk_${raw}`;
}

// GET /api/api-keys — list keys (masked)
export async function GET() {
  const ctx = await requireTenantContext();
  const keys = await db.select().from(apiKeys)
    .where(eq(apiKeys.workspaceId, ctx.currentWorkspace.id))
    .orderBy(desc(apiKeys.createdAt));
  return NextResponse.json(keys);
}

// POST /api/api-keys — create key
export async function POST(req: NextRequest) {
  const ctx = await requireTenantContext();
  const body = await req.json();
  const { name, scope = "all", permission = "read" } = body;
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const fullKey = generateApiKey();
  const id = randomUUID();

  await db.insert(apiKeys).values({
    id,
    workspaceId: ctx.currentWorkspace.id,
    name,
    keyHash: hashKey(fullKey),
    keyPrefix: fullKey.slice(0, 10),
    keySuffix: fullKey.slice(-6),
    scope,
    permission,
    createdBy: ctx.user.id,
    createdAt: new Date(),
  });

  return NextResponse.json({ id, key: fullKey, name, scope, permission });
}
