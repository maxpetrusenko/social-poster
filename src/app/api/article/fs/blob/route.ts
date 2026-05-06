import { NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { readArticleWorkspaceBinary } from "@/lib/article-agent/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const url = new URL(request.url);
  const openRef = url.searchParams.get("open");
  if (!openRef) {
    return NextResponse.json({ error: "Missing open ref" }, { status: 400 });
  }

  const file = await readArticleWorkspaceBinary(openRef).catch(() => null);
  if (!file) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  return new Response(file.body, {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(file.size),
      "cache-control": "private, max-age=60",
    },
  });
}
