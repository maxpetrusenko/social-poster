import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import {
  getArticleWorkspaceKanbanColumns,
  listArticleWorkspaceArticleSummaries,
  saveArticleWorkspaceKanbanState,
} from "@/lib/article-agent/workspace";

const kanbanColumnSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(48),
  locked: z.boolean().optional(),
});

const kanbanStateSchema = z.object({
  columns: z.array(kanbanColumnSchema).min(1).max(24),
  assignments: z.record(z.string(), z.string()),
  order: z.record(z.string(), z.array(z.string()).max(2000)),
});

export async function GET() {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const [columns, articles] = await Promise.all([
    getArticleWorkspaceKanbanColumns(),
    listArticleWorkspaceArticleSummaries(),
  ]);

  return NextResponse.json({ columns, articles });
}

export async function PUT(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = kanbanStateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid article kanban state" },
      { status: 400 }
    );
  }

  const state = await saveArticleWorkspaceKanbanState(parsed.data);
  return NextResponse.json({ state });
}
