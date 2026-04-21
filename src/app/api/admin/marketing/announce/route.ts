import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, workspaceMemberships } from "@/db/schema";
import { eq, gte } from "drizzle-orm";
import { requireAdminApi } from "@/lib/admin-auth";
import { sendNotificationEmail } from "@/lib/notifications/send";

export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subject, body, audience } = (await req.json()) as {
    subject: string;
    body: string;
    audience: "all" | "active_7d";
  };

  if (!subject || !body || !audience) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let recipientRows: { id: string }[];

  if (audience === "active_7d") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    recipientRows = await db
      .select({ id: users.id })
      .from(users)
      .where(gte(users.lastSeenAt, sevenDaysAgo));
  } else {
    recipientRows = await db
      .select({ id: users.id })
      .from(users);
  }

  let sent = 0;
  let failed = 0;
  const ts = Date.now();

  for (const user of recipientRows) {
    const [membership] = await db
      .select()
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.userId, user.id))
      .limit(1);

    if (!membership) continue;

    const result = await sendNotificationEmail({
      userId: user.id,
      workspaceId: membership.workspaceId,
      type: "marketing",
      data: { subject, message: body, html: body },
      dedupeKey: `announce:${ts}:${user.id}`,
    });

    if ("error" in result) failed++;
    else sent++;
  }

  return NextResponse.json({ sent, failed });
}
