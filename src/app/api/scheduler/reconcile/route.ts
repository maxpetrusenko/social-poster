import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { ensureSchedulerReady, getSchedulerSnapshot, reconcileSchedules } from "@/lib/scheduler";

export async function POST() {
  const authorized = await requireApiWorkspaceManager();
  if (authorized instanceof Response) return authorized;

  await ensureSchedulerReady();
  await reconcileSchedules("api:reconcile");

  return Response.json({
    ok: true,
    scheduler: getSchedulerSnapshot(),
  });
}
