import { db } from "@/db";
import { platforms, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NewScheduleForm } from "@/components/new-schedule-form";

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

  const [profileRows, platformRows] = await Promise.all([
    db.select({ id: profiles.id, name: profiles.name }).from(profiles),
    db
      .select({
        id: platforms.id,
        name: platforms.name,
        handle: platforms.handle,
      })
      .from(platforms)
      .where(eq(platforms.enabled, true)),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Create Schedule
      </h1>
      <NewScheduleForm
        profiles={profileRows}
        platforms={platformRows}
        initialCategory={category}
      />
    </div>
  );
}
