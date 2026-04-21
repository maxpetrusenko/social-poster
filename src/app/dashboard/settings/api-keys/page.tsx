import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, tenant.currentWorkspace.id))
    .orderBy(desc(apiKeys.createdAt));

  return <ApiKeysManager initialKeys={keys} />;
}
