import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function SettingsPreferencesPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Settings / Preferences"
      title="Personal defaults and delivery rules"
      description="Timezone, density, and notification preferences belong here."
      primaryAction={{ href: "/dashboard/notifications", label: "Notifications" }}
      flow="Settings -> Preferences -> user timezone / notification delivery / UX defaults."
      sections={[
        { title: "Timezone", description: "User-level timezone override for relative timestamps and planning defaults.", badge: "timezone" },
        { title: "Notification delivery", description: "Choose channels, batching, and quiet-hour posture.", badge: "delivery" },
        { title: "UX defaults", description: "Density, landing page, and personal workspace defaults later.", badge: "ux" },
      ]}
    />
  );
}
