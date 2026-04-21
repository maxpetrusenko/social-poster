import { redirect } from "next/navigation";
import { DashboardDrawerShell } from "@/components/dashboard/drawer-shell";
import { isAdmin } from "@/lib/admin-auth";
import { getInboxUnreadCounts } from "@/lib/inbox/data";
import { getTenantContext } from "@/lib/tenancy";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const inboxUnreadCounts = await getInboxUnreadCounts(tenant.currentWorkspace.id);

  return (
    <DashboardDrawerShell
      showAdminLink={isAdmin(tenant.session!.email)}
      inboxUnreadCounts={inboxUnreadCounts}
    >
      {children}
    </DashboardDrawerShell>
  );
}
