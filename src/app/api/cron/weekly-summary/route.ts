import { NextResponse } from "next/server";
import { generateWeeklySummaries } from "@/lib/marketing/weekly-summary";
import { sendNotificationEmail } from "@/lib/notifications/send";

export const dynamic = "force-dynamic";

function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summaries = await generateWeeklySummaries();
  const weekKey = getWeekKey();
  let sent = 0;
  let skipped = 0;

  for (const summary of summaries) {
    const result = await sendNotificationEmail({
      userId: summary.userId,
      workspaceId: summary.workspaceId,
      type: "marketing",
      data: {
        subject: summary.subject,
        message: "Your weekly ClawPoster summary is ready.",
        html: summary.html,
        href: "/dashboard",
      },
      dedupeKey: `weekly_summary:${summary.workspaceId}:${weekKey}`,
    });

    if (result && "skipped" in result) {
      skipped++;
    } else {
      sent++;
    }
  }

  return NextResponse.json({ sent, skipped, total: summaries.length, weekKey });
}
