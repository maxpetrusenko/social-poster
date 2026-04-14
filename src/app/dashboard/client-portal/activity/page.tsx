import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function ClientPortalActivityPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Client Portal / Activity"
      title="Decision history"
      description="Client approval history and status trail."
      primaryAction={{ href: "/dashboard/client-portal/approvals", label: "Approvals" }}
      flow="Client Portal -> Activity -> review decision history and comment trail."
      sections={[
        { title: "Decision trail", description: "Approval, rejection, request-changes, and comment activity in one chronological lane.", badge: "history" },
        { title: "Portal-safe audit", description: "Only client-visible actions appear here. Internal-only comments stay out.", badge: "audit" },
      ]}
    />
  );
}
