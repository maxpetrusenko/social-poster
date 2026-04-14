import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function SettingsAllCalendarsPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Settings / All Calendars"
      title="Cross-workspace calendar"
      description="Org-wide schedule and approval visibility across all workspaces."
      primaryAction={{ href: "/dashboard/calendar", label: "Current Calendar" }}
      flow="Settings -> All Calendars -> cross-workspace scheduled view -> grouped by workspace."
      sections={[
        { title: "Cross-workspace view", description: "Scheduled posts and later approvals grouped and color-coded by workspace.", badge: "org" },
        { title: "Read-first posture", description: "This page should favor visibility and controlled drill-in instead of direct edits.", badge: "read" },
      ]}
    />
  );
}
