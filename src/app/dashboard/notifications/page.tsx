import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function NotificationsPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Notifications"
      title="Alerts and activity deep links"
      description="Approval requests, publish failures, inbox assignments, and account issues converge here."
      primaryAction={{ href: "/dashboard/pipeline", label: "Open Pipeline" }}
      secondaryAction={{ href: "/dashboard/publish", label: "Open Publish" }}
      flow="Bell or page entry -> recent notifications -> mark read -> open item -> deep link into publish, inbox, approval, or connection state."
      sections={[
        {
          title: "Drawer view",
          description: "Recent unread items and a fast mark-read path belong in the global shell.",
          badge: "drawer",
        },
        {
          title: "History view",
          description: "Full list, filters, and delivery preferences belong on the dedicated history page.",
          badge: "history",
        },
        {
          title: "Event sources",
          description: "Publish failures, approval requests, inbox assignment, and account reconnect warnings all write into this stream.",
          badge: "events",
        },
        {
          title: "Current truth sources",
          description: "Pipeline and reply event logs remain the most reliable current data sources for failures and delivery signals.",
          badge: "current",
          href: "/dashboard/pipeline",
          hrefLabel: "Current pipeline truth",
        },
      ]}
    />
  );
}
