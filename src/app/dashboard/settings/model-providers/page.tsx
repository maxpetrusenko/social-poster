import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";
import { listModelSettings } from "@/lib/model-providers";
import { ModelProvidersManager } from "@/components/settings/model-providers-manager";

export const dynamic = "force-dynamic";

export default async function ModelProvidersPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const settings = await listModelSettings(tenant.currentWorkspace.id);
  return <ModelProvidersManager initialSettings={settings} />;
}
