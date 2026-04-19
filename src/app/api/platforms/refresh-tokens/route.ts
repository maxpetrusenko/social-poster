import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { refreshExpiringPlatformTokens } from "@/lib/providers/token-refresh";

export async function POST(request: Request) {
  const authorized = await requireApiWorkspaceManager();
  if (authorized instanceof Response) return authorized;

  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const summary = await refreshExpiringPlatformTokens({
    workspaceId: authorized.currentWorkspace.id,
    force: body.force === true,
  });

  return Response.json({ ok: summary.failed === 0, summary });
}
