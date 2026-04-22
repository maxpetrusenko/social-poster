import { NextResponse } from "next/server";
import { runDailyBlogAutomation } from "@/lib/blog/daily";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyBlogAutomation();
  return NextResponse.json(result);
}
