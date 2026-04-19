import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rssSources } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { normalizeRssFeedInput } from "@/lib/rss-config";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) return tenant;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      url?: string;
      weight?: number;
      enabled?: boolean;
    };
    const normalized = normalizeRssFeedInput(tenant.currentWorkspace.id, body);

    const [row] = await db
      .update(rssSources)
      .set({
        ...normalized,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rssSources.id, id),
          eq(rssSources.workspaceId, tenant.currentWorkspace.id)
        )
      )
      .returning();

    if (!row) {
      return Response.json({ error: "Feed not found." }, { status: 404 });
    }

    return Response.json(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("required") || message.includes("valid.") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) return tenant;

  const { id } = await context.params;
  const [row] = await db
    .delete(rssSources)
    .where(
      and(
        eq(rssSources.id, id),
        eq(rssSources.workspaceId, tenant.currentWorkspace.id)
      )
    )
    .returning();

  if (!row) {
    return Response.json({ error: "Feed not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
