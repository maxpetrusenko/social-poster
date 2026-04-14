import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function SettingsProfilePage() {
  return (
    <ShellScaffoldPage
      eyebrow="Settings / Profile"
      title="Account identity surface"
      description="Avatar, name, account details, and personal identity settings belong here."
      primaryAction={{ href: "/dashboard/settings/general", label: "Org Settings" }}
      flow="Settings -> Profile -> avatar / name / account details."
      sections={[
        { title: "Profile identity", description: "User photo, display name, and account-level details.", badge: "profile" },
        { title: "Security", description: "Password, session, and provider login controls can land here later.", badge: "later" },
      ]}
    />
  );
}
