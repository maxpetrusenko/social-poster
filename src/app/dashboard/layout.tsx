import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userUiPreferences } from "@/db/schema";
import { DashboardDrawerShell } from "@/components/dashboard/drawer-shell";
import { isAdmin } from "@/lib/admin-auth";
import { getInboxUnreadCounts } from "@/lib/inbox/data";
import { getTenantContext } from "@/lib/tenancy";
import { parseAgentDockMode, parseProductMode } from "@/lib/user-preferences";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const [inboxUnreadCounts, uiPreferences] = await Promise.all([
    getInboxUnreadCounts(tenant.currentWorkspace.id),
    db
      .select()
      .from(userUiPreferences)
      .where(
        and(
          eq(userUiPreferences.userId, tenant.user.id),
          eq(userUiPreferences.workspaceId, tenant.currentWorkspace.id)
        )
      )
      .then((rows) => rows[0] ?? null),
  ]);

  return (
    <DashboardDrawerShell
      showAdminLink={isAdmin(tenant.session!.email)}
      inboxUnreadCounts={inboxUnreadCounts}
      productMode={parseProductMode(uiPreferences?.productMode)}
      agentDockMode={parseAgentDockMode(uiPreferences?.agentDockMode)}
    >
      {children}
    </DashboardDrawerShell>
  );
}
