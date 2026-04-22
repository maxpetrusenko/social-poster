import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { ProfileWorkspace } from "@/components/profiles/profile-workspace";
import { getTenantContext } from "@/lib/tenancy";
import type { Profile } from "@/components/profiles/profile-workspace-config";

export const dynamic = "force-dynamic";

export default async function ProfileWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const { id } = await params;
  const profile = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.workspaceId, tenant.currentWorkspace.id)))
    .then((rows) => rows[0] as Profile | undefined);

  if (!profile) redirect("/dashboard/profiles");

  return <ProfileWorkspace initialProfile={profile} />;
}
