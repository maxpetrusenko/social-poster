import { redirect } from "next/navigation";
import { OrganizationSettingsPanel } from "@/components/dashboard/team-settings-panels";
import { getOrgMembersData } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

function formatDateLabel(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function SettingsGeneralPage() {
  try {
    const { context, members, workspaces } = await getOrgMembersData();

    return (
      <OrganizationSettingsPanel
        organizationName={context.organization.name}
        defaultTimezone={context.organization.defaultTimezone}
        workspaceCount={workspaces.length}
        memberCount={members.length}
        deletionScheduledForLabel={formatDateLabel(
          context.organization.deletionScheduledFor
        )}
      />
    );
  } catch {
    redirect("/login");
  }
}
