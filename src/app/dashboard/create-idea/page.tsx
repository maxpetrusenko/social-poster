import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default async function CreateIdeaPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Create Idea"
      title="Paused locally"
      description="This route is temporarily disabled while the chat-first creation flow is redesigned. Keep publishing through the existing post and publish surfaces for now."
      primaryAction={{ href: "/dashboard/publish", label: "Open Publish" }}
      secondaryAction={{ href: "/dashboard/posts", label: "Open Posts" }}
      flow="Create Idea disabled locally -> use Publish, Posts, or schedules until the chat-first workspace lands."
      sections={[
        {
          title: "Why paused",
          description:
            "The current form-first composer is being replaced by a chat-first workspace with inline platform picks, examples, and previews.",
          badge: "paused",
        },
        {
          title: "Use instead",
          description:
            "Go to Posts for current draft records, Publish for queue and sent views, or Recurrent Posts for recurring output.",
          badge: "fallback",
          href: "/dashboard/publish",
          hrefLabel: "Open publish",
        },
      ]}
    />
  );
}
