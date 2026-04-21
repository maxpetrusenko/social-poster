import { db } from "@/db";
import {
  dripQueue,
  emailEvents,
  emailSuppressions,
  leadMagnetDownloads,
  notificationDeliveries,
  notificationPreferences,
  waitlistSignups,
} from "@/db/schema";
import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import AnnouncementForm from "./announcement-form";

export const dynamic = "force-dynamic";

function Card({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">{label}</p>
      <p className="mt-1 font-serif text-2xl leading-none text-[#171717]">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[#8d7c64]">{sub}</p> : null}
    </div>
  );
}

export default async function AdminMarketingPage() {
  const [
    [waitlist],
    [marketingPrefs],
    [suppressed],
    [leadMagnets],
    deliveryRows,
    eventRows,
    [dripPending],
    [dripSent],
    [dripCancelled],
  ] = await Promise.all([
    db.select({ count: count() }).from(waitlistSignups),
    db.select({ count: count() }).from(notificationPreferences).where(eq(notificationPreferences.marketingEmails, true)),
    db.select({ count: count() }).from(emailSuppressions),
    db.select({ count: count() }).from(leadMagnetDownloads),
    db
      .select({ status: notificationDeliveries.status, count: count() })
      .from(notificationDeliveries)
      .groupBy(notificationDeliveries.status)
      .orderBy(desc(count())),
    db
      .select({ type: emailEvents.eventType, count: count() })
      .from(emailEvents)
      .groupBy(emailEvents.eventType)
      .orderBy(desc(count())),
    db.select({ count: count() }).from(dripQueue).where(and(isNull(dripQueue.sentAt), isNull(dripQueue.cancelledAt))),
    db.select({ count: count() }).from(dripQueue).where(isNotNull(dripQueue.sentAt)),
    db.select({ count: count() }).from(dripQueue).where(isNotNull(dripQueue.cancelledAt)),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold text-[#171717]">Marketing</h1>
        <p className="mt-1 text-sm text-[#8d7c64]">
          Email consent, delivery state, lead magnets, and provider events.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Waitlist" value={waitlist.count} />
        <Card label="Marketing Opt-ins" value={marketingPrefs.count} />
        <Card label="Suppressions" value={suppressed.count} />
        <Card label="Lead Magnets" value={leadMagnets.count} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Drip Pending" value={dripPending.count} />
        <Card label="Drip Sent" value={dripSent.count} />
        <Card label="Drip Cancelled" value={dripCancelled.count} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Delivery Status</h2>
          <div className="mt-4 space-y-2">
            {deliveryRows.length ? deliveryRows.map((row) => (
              <div key={row.status} className="flex justify-between rounded-lg bg-[#faf4ea] px-3 py-2 text-sm">
                <span className="font-semibold text-[#5f523f]">{row.status}</span>
                <span className="text-[#171717]">{row.count}</span>
              </div>
            )) : <p className="text-sm text-[#8d7c64]">No deliveries yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Email Events</h2>
          <div className="mt-4 space-y-2">
            {eventRows.length ? eventRows.map((row) => (
              <div key={row.type} className="flex justify-between rounded-lg bg-[#faf4ea] px-3 py-2 text-sm">
                <span className="font-semibold text-[#5f523f]">{row.type}</span>
                <span className="text-[#171717]">{row.count}</span>
              </div>
            )) : <p className="text-sm text-[#8d7c64]">No provider events yet.</p>}
          </div>
        </section>
      </div>

      <div className="mt-8">
        <AnnouncementForm />
      </div>
    </div>
  );
}
