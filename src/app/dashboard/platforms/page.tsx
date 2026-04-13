import { db } from "@/db";
import { platforms, profiles } from "@/db/schema";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { ConnectionsPage } from "@/components/dashboard/connections-page";
import type {
  PlatformRow as ConnectionPlatformRow,
  ProfileRow as ConnectionProfileRow,
} from "@/components/dashboard/connections-types";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PLATFORM_TYPES } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export default async function PlatformsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const initialPlatformType = PLATFORM_TYPES.includes(
    (params.platform as (typeof PLATFORM_TYPES)[number]) ?? "twitter"
  )
    ? ((params.platform as (typeof PLATFORM_TYPES)[number]) ?? null)
    : null;

  const [platformRows, profileRows, dashboard] = await Promise.all([
    db.select().from(platforms),
    db.select().from(profiles),
    getDashboardInsights(),
  ]);

  return (
    <ConnectionsPage
      platforms={platformRows as ConnectionPlatformRow[]}
      profiles={profileRows as ConnectionProfileRow[]}
      insights={dashboard.platformInsights}
      initialDrawerOpen={params.connect === "1"}
      initialPlatformType={initialPlatformType}
    />
  );
}
