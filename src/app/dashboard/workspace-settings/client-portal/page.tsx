import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function WorkspaceSettingsClientPortalPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Workspace Settings / Client Portal"
      title="Client access and invite flow"
      description="Portal links, invites, access posture, and published visibility rules."
      primaryAction={{ href: "/dashboard/client-portal", label: "Client Portal Home" }}
      secondaryAction={{ href: "/dashboard/workspace-settings/approvals", label: "Approvals" }}
      flow="Workspace Settings -> Client Portal -> invite clients / portal links / pending invites / access rules."
      sections={[
        { title: "Invite flow", description: "Invite client, issue link, track pending/accepted state, and later resend/revoke.", badge: "invite" },
        { title: "Visibility", description: "Decide what clients can approve, comment on, or see after publish.", badge: "visibility" },
      ]}
    />
  );
}
