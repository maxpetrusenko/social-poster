import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function ClientPortalHomePage() {
  return (
    <ShellScaffoldPage
      eyebrow="Client Portal / Home"
      title="Client-facing review dashboard"
      description="Magic-link friendly summary of pending approvals, published posts, and recent activity."
      primaryAction={{ href: "/dashboard/client-portal/approvals", label: "Approvals" }}
      secondaryAction={{ href: "/dashboard/client-portal/published", label: "Published" }}
      flow="Magic link -> Home -> summary -> jump into Approvals / Published / Activity."
      sections={[
        { title: "Portal home", description: "Pending approvals, recent decisions, and published count in a simple client-safe dashboard.", badge: "home" },
        { title: "Client-safe posture", description: "No operator-only controls, no internal-only diagnostics, no tenant leakage.", badge: "safe" },
      ]}
    />
  );
}
