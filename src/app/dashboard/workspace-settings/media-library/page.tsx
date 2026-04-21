import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function WorkspaceSettingsMediaLibraryPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Workspace Settings / Media Library"
      title="Workspace asset library"
      description="Client or brand scoped assets, folders, and composer reuse."
      primaryAction={{ href: "/dashboard/posts/create", label: "Create Post" }}
      flow="Workspace Settings -> Media Library -> workspace assets / search / reuse."
      sections={[
        { title: "Workspace assets", description: "Brand-specific images, video, and reusable media live here.", badge: "library" },
        { title: "Composer integration", description: "Library picker should plug directly into the Create Post composer.", badge: "composer" },
      ]}
    />
  );
}
