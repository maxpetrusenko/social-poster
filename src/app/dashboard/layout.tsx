import { redirect } from "next/navigation";
import { DashboardDrawerShell } from "@/components/dashboard/drawer-shell";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardDrawerShell
    >
      {children}
    </DashboardDrawerShell>
  );
}
