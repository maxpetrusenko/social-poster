import { db } from "@/db";
import { rssSettings } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { requireApiSession } from "@/lib/auth";
import {
  getWorkspaceRssSettings,
  normalizeRssSettingsInput,
} from "@/lib/rss-config";
import { getTenantContext } from "@/lib/tenancy";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const tenant = await getTenantContext();
  if (!tenant) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await getWorkspaceRssSettings(tenant.currentWorkspace.id));
}

export async function POST(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) return tenant;

  try {
    const body = (await request.json()) as {
      candidateWindowHours?: number;
      candidatePoolSize?: number;
      minimumScore?: number;
      tractionWeight?: number;
      keywordBoostTerms?: string[];
      xTemplate?: string;
      linkedinTemplate?: string;
      transformationPrompt?: string;
      imageSelectionMode?: "prefer_feed" | "prefer_open_graph" | "feed_only";
      imageSelectionNotes?: string;
    };

    const normalized = normalizeRssSettingsInput(body);
    const now = new Date();
    const existing = await db
      .select({ workspaceId: rssSettings.workspaceId })
      .from(rssSettings)
      .where(eq(rssSettings.workspaceId, tenant.currentWorkspace.id))
      .get();

    const [row] = existing
      ? await db
          .update(rssSettings)
          .set({
            ...normalized,
            updatedAt: now,
          })
          .where(eq(rssSettings.workspaceId, tenant.currentWorkspace.id))
          .returning()
      : await db
          .insert(rssSettings)
          .values({
            workspaceId: tenant.currentWorkspace.id,
            ...normalized,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

    return Response.json(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
