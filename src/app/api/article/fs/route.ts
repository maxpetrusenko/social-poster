import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import {
  createArticleWorkspaceEntry,
  deleteArticleWorkspaceEntry,
  getArticleWorkspacePreview,
  renameArticleWorkspaceEntry,
  writeArticleWorkspaceText,
} from "@/lib/article-agent/workspace";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  openRef: z.string().min(1).max(1200),
  text: z.string().max(500_000),
});

const PostSchema = z.object({
  parentOpenRef: z.string().min(1).max(1200),
  name: z.string().min(1).max(180),
  kind: z.enum(["file", "directory"]),
  text: z.string().max(500_000).optional(),
});

const PutSchema = z.object({
  openRef: z.string().min(1).max(1200),
  name: z.string().min(1).max(180),
});

const DeleteSchema = z.object({
  openRef: z.string().min(1).max(1200),
});

export async function GET(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const url = new URL(request.url);
  const parsed = PatchSchema.pick({ openRef: true }).safeParse({ openRef: url.searchParams.get("open") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid article workspace read payload." }, { status: 400 });
  }

  const preview = await getArticleWorkspacePreview(parsed.data.openRef).catch((error) => ({
    error: error instanceof Error ? error.message : "Read failed.",
  }));

  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: 400 });
  }

  if (preview.kind !== "file" || preview.text == null) {
    return NextResponse.json({ error: "File is not readable text." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    openRef: preview.openRef,
    text: preview.text,
    truncated: preview.truncated,
    size: preview.size,
    mtime: preview.mtime?.toISOString(),
  });
}

export async function POST(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid article workspace create payload." }, { status: 400 });
  }

  const result = await createArticleWorkspaceEntry(parsed.data.parentOpenRef, {
    name: parsed.data.name,
    kind: parsed.data.kind,
    text: parsed.data.text,
  }).catch((error) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Create failed.",
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, openRef: result.openRef });
}

export async function PATCH(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid article workspace edit payload." }, { status: 400 });
  }

  const result = await writeArticleWorkspaceText(parsed.data.openRef, parsed.data.text).catch((error) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Save failed.",
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, size: result.size });
}

export async function PUT(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid article workspace rename payload." }, { status: 400 });
  }

  const result = await renameArticleWorkspaceEntry(parsed.data.openRef, parsed.data.name).catch((error) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Rename failed.",
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, openRef: result.openRef });
}

export async function DELETE(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid article workspace delete payload." }, { status: 400 });
  }

  const result = await deleteArticleWorkspaceEntry(parsed.data.openRef).catch((error) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Delete failed.",
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, openRef: result.openRef });
}
