import { Sidebar } from "@/components/sidebar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="min-h-screen lg:ml-[276px]">
        <div className="container py-4 pb-10 md:py-6 md:pb-16">
          <div className="mb-4 flex gap-2 overflow-x-auto rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white/82 p-2 shadow-[0_12px_36px_rgba(12,17,21,0.08)] backdrop-blur-[8px] lg:hidden">
            {[
              ["/dashboard", "Overview"],
              ["/dashboard/calendar", "Calendar"],
              ["/dashboard/platforms", "Connections"],
              ["/dashboard/schedules", "Schedules"],
              ["/dashboard/categories", "Categories"],
              ["/dashboard/pipeline", "Pipeline"],
              ["/dashboard/replies", "Replies"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="shrink-0 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]"
              >
                {label}
              </Link>
            ))}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
