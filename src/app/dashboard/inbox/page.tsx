import { ShellScaffoldPage } from "@/components/dashboard/shell-scaffold-page";

export default function InboxPage() {
  return (
    <ShellScaffoldPage
      eyebrow="Social Inbox"
      title="Threads, assignment, SLA, reply"
      description="Unified inbox shell for messages and mentions. Current reply engine remains the debug lane until parity is complete."
      primaryAction={{ href: "/dashboard/replies", label: "Open Replies Log" }}
      secondaryAction={{ href: "/dashboard/notifications", label: "Open Notifications" }}
      flow="Workspace -> Social Inbox -> All / My Queue / Unassigned -> open conversation -> assign / label / saved reply / SLA handling / reply."
      sections={[
        {
          title: "Queue lanes",
          description: "All, My Queue, and Unassigned split the pressure and ownership model.",
          badge: "queue",
        },
        {
          title: "Conversation view",
          description: "Message thread, account context, labels, assignee, sentiment, and response box live in one operator frame.",
          badge: "thread",
        },
        {
          title: "Saved replies",
          description: "Fast response snippets and draft assistance plug into the same reply box.",
          badge: "reply",
        },
        {
          title: "Current fallback",
          description: "Until inbox parity lands, the X reply engine log remains the operational source for sent/failed reply events.",
          badge: "fallback",
          href: "/dashboard/replies",
          hrefLabel: "Current replies page",
        },
      ]}
    />
  );
}
