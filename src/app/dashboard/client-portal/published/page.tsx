import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function ClientPortalPublishedPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Client Portal / Published"
      title="Published content view"
      description="Client-facing visibility into live content and later reports."
      primaryAction={{ href: "/dashboard/client-portal/activity", label: "Activity" }}
      flow="Client Portal -> Published -> live content / URLs / timestamps / later reporting."
      sections={[
        { title: "Published list", description: "Show live content, timestamps, channel labels, and direct links out.", badge: "live" },
        { title: "Reports later", description: "Client reports can expand from this lane once analytics/reporting land.", badge: "later" },
      ]}
    />
  );
}
