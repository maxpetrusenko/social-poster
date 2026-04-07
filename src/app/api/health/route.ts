import { getActiveScheduleIds } from "@/lib/scheduler";

export async function GET() {
  return Response.json({
    status: "ok",
    app: "social-poster",
    time: new Date().toISOString(),
    schedules: getActiveScheduleIds().length,
  });
}
