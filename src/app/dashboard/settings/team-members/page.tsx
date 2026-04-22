import { redirect } from "next/navigation";
import { TeamMembersPanel } from "@/components/dashboard/team-settings-panels";
import {
  canManageOrganization,
  getOrgMembersData,
} from "@/lib/tenancy";
import { getAppUrlFromEnv } from "@/lib/app-url";

export const dynamic = "force-dynamic";

function formatDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function getTeamMembersNotice(status: string | null) {
  switch (status) {
    case "invite-sent":
      return {
        tone: "good" as const,
        title: "access email sent",
        description: "Provider accepted the SMM Agent access email.",
      };
    case "invite-delivery-failed":
      return {
        tone: "warn" as const,
        title: "access saved; email blocked",
        description:
          "The pending access link still exists below. Copy it while Resend or SMTP is being fixed.",
      };
    case "invite-preview":
      return {
        tone: "warn" as const,
        title: "access saved; email not configured",
        description:
          "No Resend or SMTP credentials are active for this server. Copy the access link below or add email credentials.",
      };
    case "invite-resent":
      return {
        tone: "good" as const,
        title: "access email resent",
        description: "A fresh SMM Agent access email was submitted to the provider.",
      };
    case "invite-resend-delivery-failed":
      return {
        tone: "warn" as const,
        title: "access refreshed; email blocked",
        description:
          "The pending access token was rotated. Copy the updated link below while delivery is unavailable.",
      };
    default:
      return null;
  }
}

export default async function SettingsTeamMembersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const params = searchParams ? await searchParams : {};
    const rawStatus = params.status;
    const status = typeof rawStatus === "string" ? rawStatus : null;
    const { context, members, invitations } = await getOrgMembersData();
    if (!canManageOrganization(context)) {
      redirect("/dashboard");
    }
    const appUrl = getAppUrlFromEnv();

    return (
      <TeamMembersPanel
        members={members
          .sort((left, right) => left.user.email.localeCompare(right.user.email))
          .map((row) => ({
            membershipId: row.membership.id,
            userId: row.user.id,
            name: row.user.fullName ?? row.user.email,
            email: row.user.email,
            orgRole: row.membership.orgRole as "owner" | "admin" | "member",
            isCurrentUser: row.user.id === context.user.id,
          }))}
        invitations={invitations.map((invite) => ({
          id: invite.id,
          email: invite.email,
          orgRole: invite.orgRole as "owner" | "admin" | "member",
          createdAtLabel: formatDateLabel(invite.createdAt),
          expiresAtLabel: formatDateLabel(invite.expiresAt),
          url: `${appUrl}/invite/${invite.token}`,
        }))}
        notice={getTeamMembersNotice(status)}
      />
    );
  } catch {
    redirect("/login");
  }
}
