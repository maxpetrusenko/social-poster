import { db } from "@/db";
import { rssSettings } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import {
  ensureWorkspaceRssConfig,
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

  await ensureWorkspaceRssConfig(tenant.currentWorkspace.id);
  const row = await db
    .select()
    .from(rssSettings)
    .where(eq(rssSettings.workspaceId, tenant.currentWorkspace.id))
    .get();

  return Response.json(row);
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    await ensureWorkspaceRssConfig(tenant.currentWorkspace.id);
    const normalized = normalizeRssSettingsInput(body);

    const [row] = await db
      .update(rssSettings)
      .set({
        ...normalized,
        updatedAt: new Date(),
      })
      .where(eq(rssSettings.workspaceId, tenant.currentWorkspace.id))
      .returning();

    return Response.json(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
