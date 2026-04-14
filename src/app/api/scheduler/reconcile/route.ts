import { ensureSchedulerReady, getSchedulerSnapshot, reconcileSchedules } from "@/lib/scheduler";

export async function POST() {
  await ensureSchedulerReady();
  await reconcileSchedules("api:reconcile");

  return Response.json({
    ok: true,
    scheduler: getSchedulerSnapshot(),
  });
}
