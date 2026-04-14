import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { listReplyCandidates, refreshReplyCandidates } from "@/lib/replies/live";
import { z } from "zod";

const refreshSchema = z.object({
  platformId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const platformId = request.nextUrl.searchParams.get("platformId") || undefined;
  const cards = await listReplyCandidates(platformId);
  return NextResponse.json({ cards });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const body = refreshSchema.parse(await request.json());
    const cards = await refreshReplyCandidates(body.platformId);
    return NextResponse.json({ cards });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh replies" },
      { status: 500 }
    );
  }
}
