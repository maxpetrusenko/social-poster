import { redirect } from "next/navigation";
import { DashboardDrawerShell } from "@/components/dashboard/drawer-shell";
import { getSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenancy";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  return (
    <DashboardDrawerShell
    >
      {children}
    </DashboardDrawerShell>
  );
}
