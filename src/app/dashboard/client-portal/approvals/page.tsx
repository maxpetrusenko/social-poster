import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function ClientPortalApprovalsPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Client Portal / Approvals"
      title="Approve, request changes, reject"
      description="Client-facing review lane for pending content."
      primaryAction={{ href: "/dashboard/publish", label: "Publish Shell" }}
      secondaryAction={{ href: "/dashboard/client-portal/published", label: "Published" }}
      flow="Client Portal -> Approvals -> open pending post -> preview media/caption -> approve / request changes / reject / comment."
      sections={[
        { title: "Pending queue", description: "List pending approvals with due date, channels, and latest revision.", badge: "queue" },
        { title: "Decision form", description: "Approve, request changes, reject, and leave comments against the current revision.", badge: "decision" },
      ]}
    />
  );
}
