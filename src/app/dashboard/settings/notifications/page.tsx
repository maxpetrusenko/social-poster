import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NotificationsPanel } from "@/components/settings/notifications-panel";

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, tenant.user.id), eq(notificationPreferences.workspaceId, tenant.currentWorkspace.id)))
    .then((rows) => rows[0] || null);

  return (
    <NotificationsPanel
      defaults={{
        postFailures: prefs?.postFailures ?? true,
        accountDisconnects: prefs?.accountDisconnects ?? true,
        paymentAlerts: prefs?.paymentAlerts ?? true,
        usageAlerts: prefs?.usageAlerts ?? true,
        marketingEmails: prefs?.marketingEmails ?? true,
      }}
    />
  );
}
