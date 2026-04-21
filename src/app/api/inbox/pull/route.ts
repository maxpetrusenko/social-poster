import { NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { isInboxSurface } from "@/lib/inbox/platforms";
import { pullInboxSurface } from "@/lib/inbox/data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = await requireApiWorkspaceEditor();
  if (context instanceof NextResponse) return context;

  try {
    const body = (await request.json()) as {
      surface?: string;
      platformKey?: string;
    };
    if (!isInboxSurface(body.surface)) {
      return NextResponse.json({ error: "Invalid inbox surface." }, { status: 400 });
    }
    if (!body.platformKey) {
      return NextResponse.json({ error: "Platform key is required." }, { status: 400 });
    }

    const result = await pullInboxSurface(
      context.currentWorkspace.id,
      body.surface,
      body.platformKey
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to pull inbox." },
      { status: 500 }
    );
  }
}
