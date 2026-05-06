import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import {
  loadArticleAgentSettings,
  saveArticleGenerationSettings,
} from "@/lib/article-agent/config";
import type { ArticleGenerationSettingsInput } from "@/lib/article-agent/options";

const controlSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  quick: z.boolean(),
  kind: z.enum(["select", "number", "boolean", "text"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(120),
        label: z.string().trim().min(1).max(120),
        description: z.string().max(240).optional(),
      })
    )
    .optional(),
  description: z.string().max(400).optional(),
  removable: z.boolean().optional(),
});

const generationSettingsSchema = z.object({
  defaults: z.record(z.string(), z.unknown()).optional(),
  controls: z.array(controlSchema).max(40).optional(),
  formatPresets: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(120),
        prompt: z.string().trim().min(1).max(2000),
        description: z.string().trim().min(1).max(400),
      })
    )
    .max(20)
    .optional(),
});

export async function GET() {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const settings = await loadArticleAgentSettings();
  return NextResponse.json({
    generation: settings.generation,
    generationSettingsPath: settings.generationSettingsPath,
  });
}

export async function PATCH(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = generationSettingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid article settings" },
      { status: 400 }
    );
  }

  const generation = await saveArticleGenerationSettings(parsed.data as ArticleGenerationSettingsInput);
  return NextResponse.json({ generation });
}
