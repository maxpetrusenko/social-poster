import { NextResponse } from "next/server";
import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const session = await requireAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(waitlistSignups)
    .orderBy(desc(waitlistSignups.createdAt));

  const header = "email,source,signed_up";
  const csvRows = rows.map(
    (r) =>
      [r.email, r.source, r.createdAt.toISOString()].map(csvCell).join(","),
  );
  const csv = [header, ...csvRows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="signup-history-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
