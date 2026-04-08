import { db } from "@/db";
import { schedules } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const enabledSchedules =
    (await db.select().from(schedules).where(eq(schedules.enabled, true))).length;

  return Response.json({
    status: "ok",
    app: "social-poster",
    time: new Date().toISOString(),
    schedules: enabledSchedules,
  });
}
