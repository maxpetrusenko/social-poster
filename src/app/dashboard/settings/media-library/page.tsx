import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function SettingsMediaLibraryPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Settings / Media Library"
      title="Shared org asset library"
      description="Folders, reusable assets, and shared media governance belong here."
      primaryAction={{ href: "/dashboard/workspace-settings/media-library", label: "Workspace Library" }}
      flow="Settings -> Media Library -> shared assets / folders / reuse."
      sections={[
        { title: "Shared assets", description: "Assets shared across workspaces and client brands.", badge: "shared" },
        { title: "Governance", description: "Folder structure, retention, and approval posture later.", badge: "governance" },
      ]}
    />
  );
}
