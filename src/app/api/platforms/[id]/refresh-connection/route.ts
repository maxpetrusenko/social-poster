import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { getRequestAppUrl } from "@/lib/app-url";
import { oauthCallbackUrl } from "@/lib/providers/oauth-state";
import { refreshPlatformConnection } from "@/lib/providers/token-refresh";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const INSTAGRAM_TYPES = new Set(["instagram", "instagram_personal"]);

// POST /api/platforms/[id]/refresh-connection
// Instagram (direct) only. Tries to refresh the stored long-lived token. If that is
// impossible (expired/invalidated/no token), answers `reauth_required` with a
// browser URL: OAuth must finish in a browser session, so an agent hands the URL to a human.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceManager();
  if (tenant instanceof NextResponse) return tenant;

  const { id } = await params;
  const platform = await db.query.platforms.findFirst({
    where: and(eq(platforms.id, id), eq(platforms.workspaceId, tenant.currentWorkspace.id)),
  });
  if (!platform) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }
  if (!INSTAGRAM_TYPES.has(platform.type) || platform.provider !== "direct") {
    return NextResponse.json(
      { error: "Refresh connection is only available for direct Instagram connections." },
      { status: 400 }
    );
  }

  const outcome = await refreshPlatformConnection(platform);
  if (outcome.status === "refreshed") {
    return NextResponse.json({ status: "refreshed", expiresAt: outcome.nextExpiresAt });
  }

  const appUrl = getRequestAppUrl(request);
  const reconnectUrl = new URL(`/api/auth/${platform.type.replace(/_/g, "-")}`, appUrl);
  reconnectUrl.searchParams.set("next", "/dashboard/workspace-settings/social-accounts");
  return NextResponse.json(
    {
      status: "reauth_required",
      reason: outcome.reason,
      reconnectUrl: reconnectUrl.toString(),
      redirectUri: oauthCallbackUrl(platform.type, request),
    },
    { status: 409 }
  );
}
