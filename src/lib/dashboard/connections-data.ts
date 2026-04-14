import { db } from "@/db";
import { platforms, profiles } from "@/db/schema";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { eq } from "drizzle-orm";
import type {
  PlatformRow as ConnectionPlatformRow,
  ProfileRow as ConnectionProfileRow,
} from "@/components/dashboard/connections-types";

export async function getConnectionsPageData(workspaceId: string) {
  const [platformRows, profileRows, dashboard] = await Promise.all([
    db.select().from(platforms).where(eq(platforms.workspaceId, workspaceId)),
    db.select().from(profiles),
    getDashboardInsights(),
  ]);

  return {
    platforms: platformRows as ConnectionPlatformRow[],
    profiles: profileRows as ConnectionProfileRow[],
    insights: dashboard.platformInsights,
  };
}
