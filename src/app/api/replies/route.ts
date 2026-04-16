import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  listReplyCandidates,
  processReadyReplyQueue,
  refreshReplyCandidatesWithDiagnostics,
  REPLY_REFRESH_MODES,
} from "@/lib/replies/live";
import {
  ACCEPTED_REPLY_PROFILE_IDS,
  DEFAULT_REPLY_PROFILE_ID,
  isAgentPersonaProfile,
  type ReplyProfileId,
} from "@/lib/replies/profiles";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenancy";
import {
  REPLY_LANGUAGE_OPTIONS,
  normalizeReplyLanguage,
} from "@/lib/replies/language";

const refreshSchema = z.object({
  platformId: z.string().min(1),
  profileId: z.enum(ACCEPTED_REPLY_PROFILE_IDS).optional(),
  mode: z.enum(REPLY_REFRESH_MODES).optional(),
  language: z.enum(REPLY_LANGUAGE_OPTIONS).optional(),
});

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const platformId = request.nextUrl.searchParams.get("platformId") || undefined;
    const profileParam = request.nextUrl.searchParams.get("profileId");
    const profileId = normalizeReplyProfileId(profileParam);
    const language = normalizeReplyLanguage(
      request.nextUrl.searchParams.get("language")
    );

    void processReadyReplyQueue(platformId).catch((error) => {
      console.error("[api/replies] ready queue sweep failed:", error);
    });

    const cards = await listReplyCandidates(
      platformId,
      profileId,
      tenant.currentWorkspace.id,
      language
    );
    return NextResponse.json({ cards });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load replies" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = refreshSchema.parse(await request.json());
    const result = await refreshReplyCandidatesWithDiagnostics(
      body.platformId,
      normalizeReplyProfileId(body.profileId),
      tenant.currentWorkspace.id,
      body.mode ?? "manual",
      normalizeReplyLanguage(body.language)
    );
    return NextResponse.json(result);
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

function normalizeReplyProfileId(value?: string | null): ReplyProfileId | undefined {
  if (!value) return undefined;
  if (isAgentPersonaProfile(value)) return DEFAULT_REPLY_PROFILE_ID;
  return undefined;
}
