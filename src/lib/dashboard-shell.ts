export type ShellNavItem = {
  label: string;
  href: string;
  blurb: string;
  icon: "publish" | "create" | "inbox" | "replies" | "notifications" | "schedules" | "categories" | "rss" | "accounts" | "profiles" | "overview" | "pipeline" | "team" | "settings" | "posts" | "articles";
  children?: ShellNavItem[];
};

export function isShellNavHrefActive(
  pathname: string,
  href: string,
  exact = false
) {
  if (pathname === href) return true;
  return !exact && href !== "/dashboard" && pathname.startsWith(`${href}/`);
}

export const workspaceShellNav: ShellNavItem[] = [
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    blurb: "Monthly cadence, runs, timing.",
    icon: "publish",
  },
  {
    label: "Posts",
    href: "/dashboard/posts",
    blurb: "Create, manage, and schedule posts.",
    icon: "create",
    children: [
      {
        label: "All Posts",
        href: "/dashboard/posts",
        blurb: "View all posts.",
        icon: "create",
      },
      {
        label: "Create Post",
        href: "/dashboard/posts/create",
        blurb: "New post composer.",
        icon: "create",
      },
      {
        label: "Recurrent Posts",
        href: "/dashboard/categories",
        blurb: "Recurring slots and buckets.",
        icon: "categories",
      },
      {
        label: "Liked Queue",
        href: "/dashboard/likes",
        blurb: "Review liked X posts before reuse.",
        icon: "rss",
      },
    ],
  },
  {
    label: "Social Inbox",
    href: "/dashboard/inbox",
    blurb: "Replies, comments, DMs.",
    icon: "inbox",
    children: [
      {
        label: "X Replies",
        href: "/dashboard/inbox/replies",
        blurb: "X reply engine and platform replies.",
        icon: "replies",
      },
      {
        label: "Comments",
        href: "/dashboard/inbox/comments",
        blurb: "Post comments and review replies.",
        icon: "inbox",
      },
      {
        label: "DMs",
        href: "/dashboard/inbox/dms",
        blurb: "Direct message queues.",
        icon: "inbox",
      },
    ],
  },
  {
    label: "Article Generation",
    href: "/dashboard/articles",
    blurb: "Research, write, edit Markdown.",
    icon: "articles",
    children: [
      {
        label: "Articles",
        href: "/dashboard/articles",
        blurb: "Review article drafts.",
        icon: "articles",
      },
      {
        label: "New Article",
        href: "/dashboard/articles/new",
        blurb: "Prompt or URL chatbot.",
        icon: "create",
      },
      {
        label: "Website Preview",
        href: "/dashboard/articles/preview",
        blurb: "Review published articles on smmagent.app.",
        icon: "articles",
      },
      {
        label: "Settings",
        href: "/dashboard/articles/settings",
        blurb: "Prompt, skills, API keys.",
        icon: "settings",
      },
    ],
  },
  {
    label: "Notifications",
    href: "/dashboard/notifications",
    blurb: "Alerts, approvals, failures.",
    icon: "notifications",
  },
  {
    label: "Schedules",
    href: "/dashboard/schedules",
    blurb: "Cadence, drift, run control.",
    icon: "schedules",
  },
  {
    label: "RSS",
    href: "/dashboard/rss",
    blurb: "Feeds, scoring, rewrite rules.",
    icon: "rss",
  },
];

export const channelShellNav: ShellNavItem[] = [
  {
    label: "Social Accounts",
    href: "/dashboard/workspace-settings/social-accounts",
    blurb: "Connect, verify, reconnect.",
    icon: "accounts",
  },
  {
    label: "Campaigns",
    href: "/dashboard/campaigns",
    blurb: "Profile-based creative runs.",
    icon: "categories",
  },
  {
    label: "Profiles",
    href: "/dashboard/profiles",
    blurb: "Voice, face, tone presets.",
    icon: "profiles",
  },
];

export const utilityShellNav: ShellNavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    blurb: "Main board and KPIs.",
    icon: "overview",
  },
  {
    label: "Work review",
    href: "/dashboard/review",
    blurb: "Review proven work before release.",
    icon: "posts",
  },
  {
    label: "Work analytics",
    href: "/dashboard/analytics",
    blurb: "Approval, learning, and trace signals.",
    icon: "pipeline",
  },
  {
    label: "Pipeline",
    href: "/dashboard/pipeline",
    blurb: "Run history and step truth.",
    icon: "pipeline",
  },
];

export const agenticShellNav: ShellNavItem[] = [
  {
    label: "Agent",
    href: "/dashboard",
    blurb: "Tell SMM Agent what to do next.",
    icon: "overview",
  },
  {
    label: "Review",
    href: "/dashboard/review",
    blurb: "Approve proven work and blocked actions.",
    icon: "posts",
  },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    blurb: "Planned posts, recurring runs, and history.",
    icon: "publish",
  },
  {
    label: "Sources",
    href: "/dashboard/rss",
    blurb: "Feeds, profiles, campaigns, and source evidence.",
    icon: "rss",
    children: [
      {
        label: "Articles",
        href: "/dashboard/articles",
        blurb: "Long-form article generation.",
        icon: "articles",
      },
      {
        label: "RSS",
        href: "/dashboard/rss",
        blurb: "Feed scoring and rewrite rules.",
        icon: "rss",
      },
      {
        label: "Campaigns",
        href: "/dashboard/campaigns",
        blurb: "Profile-based creative runs.",
        icon: "categories",
      },
      {
        label: "Profiles",
        href: "/dashboard/profiles",
        blurb: "Voice, face, tone presets.",
        icon: "profiles",
      },
    ],
  },
  {
    label: "Results",
    href: "/dashboard/analytics",
    blurb: "Approval, learning, traces, and outcomes.",
    icon: "pipeline",
    children: [
      {
        label: "Pipeline",
        href: "/dashboard/pipeline",
        blurb: "Runs, logs, and execution truth.",
        icon: "pipeline",
      },
    ],
  },
];

export const agenticFooterShellNav: ShellNavItem[] = [
  {
    label: "Accounts",
    href: "/dashboard/workspace-settings/social-accounts",
    blurb: "Connect, verify, reconnect.",
    icon: "accounts",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    blurb: "Mode, placement, billing, API keys.",
    icon: "settings",
  },
];

export const footerShellNav: ShellNavItem[] = [
  {
    label: "Settings",
    href: "/dashboard/settings",
    blurb: "Usage, billing, API keys, notifications.",
    icon: "settings",
  },
];
