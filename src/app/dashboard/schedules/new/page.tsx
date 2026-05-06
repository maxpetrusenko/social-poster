import { db } from "@/db";
import { platforms, profiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NewScheduleForm } from "@/components/new-schedule-form";
import { DashboardPageContent } from "@/components/dashboard/ui";
import { getTenantContext } from "@/lib/tenancy";
import { redirect } from "next/navigation";

export default async function NewSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const category =
    typeof params.category === "string" && params.category.trim()
      ? params.category
      : "opinion_take";
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const [profileRows, platformRows] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.workspaceId, tenant.currentWorkspace.id)),
    db
      .select({
        id: platforms.id,
        name: platforms.name,
        handle: platforms.handle,
      })
      .from(platforms)
      .where(
        and(
          eq(platforms.workspaceId, tenant.currentWorkspace.id),
          eq(platforms.enabled, true)
        )
      ),
  ]);

  return (
    <DashboardPageContent>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Create Schedule
      </h1>
      <NewScheduleForm
        profiles={profileRows}
        platforms={platformRows}
        initialCategory={category}
      />
    </DashboardPageContent>
  );
}
