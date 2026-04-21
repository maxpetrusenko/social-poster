import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function NotificationsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, tenant.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">Notifications</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-[#171717]">Alerts and activity</h1>
        <p className="mt-1 text-sm text-[#8d7c64]">
          Publish failures, account reconnect warnings, usage alerts, and email delivery events.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e5d9c8] bg-white">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-[#8d7c64]">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-[#e5d9c8]">
            {rows.map((row) => (
              <article key={row.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#171717]">{row.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-[#5f523f]">{row.body}</p>
                  </div>
                  <span className="rounded-full bg-[#f5f0e6] px-3 py-1 text-xs font-semibold text-[#8d7c64]">
                    {row.severity}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[#9b8c78]">{formatDate(row.createdAt)}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
