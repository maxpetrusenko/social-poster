import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userUiPreferences } from "@/db/schema";
import { UiPreferencesPanel } from "@/components/settings/ui-preferences-panel";
import { getTenantContext } from "@/lib/tenancy";
import {
  parseAgentDockMode,
  parseProductMode,
} from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

export default async function SettingsPreferencesPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const prefs = await db
    .select()
    .from(userUiPreferences)
    .where(
      and(
        eq(userUiPreferences.userId, tenant.user.id),
        eq(userUiPreferences.workspaceId, tenant.currentWorkspace.id)
      )
    )
    .then((rows) => rows[0] ?? null);

  return (
    <UiPreferencesPanel
      defaults={{
        productMode: parseProductMode(prefs?.productMode),
        agentDockMode: parseAgentDockMode(prefs?.agentDockMode),
      }}
    />
  );
}
