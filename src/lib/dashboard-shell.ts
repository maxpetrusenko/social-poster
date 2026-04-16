export type ShellNavItem = {
  label: string;
  href: string;
  blurb: string;
  icon: "publish" | "create" | "inbox" | "replies" | "notifications" | "schedules" | "categories" | "rss" | "accounts" | "profiles" | "overview" | "pipeline" | "team" | "settings";
};

export const workspaceShellNav: ShellNavItem[] = [
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    blurb: "Monthly cadence, runs, timing.",
    icon: "publish",
  },
  {
    label: "Create Idea",
    href: "/dashboard/create-idea",
    blurb: "Composer, templates, feeds.",
    icon: "create",
  },
  {
    label: "Social Inbox",
    href: "/dashboard/inbox",
    blurb: "Threads, assignment, replies.",
    icon: "inbox",
  },
  {
    label: "Replies",
    href: "/dashboard/replies",
    blurb: "X reply engine log.",
    icon: "replies",
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
    label: "Recurrent Posts",
    href: "/dashboard/categories",
    blurb: "Recurring slots and content buckets.",
    icon: "categories",
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
    label: "Manage Team",
    href: "/dashboard/settings/team-members",
    blurb: "Members, roles, access.",
    icon: "team",
  },
  {
    label: "Settings",
    href: "/dashboard/settings/general",
    blurb: "Org and workspace control.",
    icon: "settings",
  },
];
