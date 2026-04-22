export type ShellNavItem = {
  label: string;
  href: string;
  blurb: string;
  icon: "publish" | "create" | "inbox" | "replies" | "notifications" | "schedules" | "categories" | "rss" | "accounts" | "profiles" | "overview" | "pipeline" | "team" | "settings" | "posts";
  children?: ShellNavItem[];
};

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
    label: "Dashboard",
    href: "/dashboard",
    blurb: "Main board and KPIs.",
    icon: "overview",
  },
  {
    label: "Pipeline",
    href: "/dashboard/pipeline",
    blurb: "Run history and step truth.",
    icon: "pipeline",
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
