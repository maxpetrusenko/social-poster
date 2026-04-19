import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rssSources } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { requireApiSession } from "@/lib/auth";
import {
  ensureWorkspaceRssConfig,
  normalizeRssFeedInput,
} from "@/lib/rss-config";
import { getTenantContext } from "@/lib/tenancy";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const tenant = await getTenantContext();
  if (!tenant) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureWorkspaceRssConfig(tenant.currentWorkspace.id);
  const rows = await db
    .select()
    .from(rssSources)
    .where(eq(rssSources.workspaceId, tenant.currentWorkspace.id));

  return Response.json(rows);
}

export async function POST(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) return tenant;

  try {
    const body = (await request.json()) as {
      name?: string;
      url?: string;
      weight?: number;
      enabled?: boolean;
    };

    const normalized = normalizeRssFeedInput(
      tenant.currentWorkspace.id,
      body
    );
    const now = new Date();

    const [row] = await db
      .insert(rssSources)
      .values({
        id: crypto.randomUUID(),
        ...normalized,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return Response.json(row, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const code = error instanceof Error && "code" in error ? (error as { code: string }).code : "";
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return Response.json({ error: "This RSS source already exists." }, { status: 409 });
    }
    const status = message.includes("required") || message.includes("valid.") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
