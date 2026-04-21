import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const ctx = await requireTenantContext();
  const body = await req.json();
  const { key, value } = body;

  const validKeys = ["postFailures", "accountDisconnects", "paymentAlerts", "usageAlerts", "marketingEmails"] as const;
  if (!validKeys.includes(key)) {
    return NextResponse.json({ error: "Invalid preference key" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, ctx.user.id),
        eq(notificationPreferences.workspaceId, ctx.currentWorkspace.id)
      )
    )
    .then((rows) => rows[0] || null);

  const now = new Date();

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({ [key]: value ? 1 : 0, updatedAt: now })
      .where(eq(notificationPreferences.id, existing.id));
  } else {
    await db.insert(notificationPreferences).values({
      id: randomUUID(),
      userId: ctx.user.id,
      workspaceId: ctx.currentWorkspace.id,
      [key]: value ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ ok: true });
}
