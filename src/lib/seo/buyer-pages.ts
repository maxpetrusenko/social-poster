/**
 * seo_h006: short buyer-intent landing pages, one per purchase-intent keyword.
 * Keyword sits in the slug, title, H1 and first sentence. Copy only states what
 * the product does today (waitlist stage, no pricing, no stats).
 */
export const BUYER_PAGES_LASTMOD = "2026-11-09";

export type BuyerPage = {
  slug: string;
  keyword: string;
  title: string; // <= 60 chars incl. brand
  description: string;
  h1: string;
  intro: string;
  points: { heading: string; body: string }[];
  cta: string;
};

export const BUYER_PAGES: BuyerPage[] = [
  {
    slug: "social-media-scheduler-for-agencies",
    keyword: "social media scheduler for agencies",
    title: "Social Media Scheduler for Agencies | SMM Agent",
    description:
      "A social media scheduler for agencies: one workspace, separate brand voices per client, and approval before anything is posted. Join the SMM Agent waitlist.",
    h1: "Social media scheduler for agencies",
    intro:
      "SMM Agent is a social media scheduler for agencies that keeps each client brand in its own voice and holds drafts for approval before they go live.",
    points: [
      { heading: "One workspace, separate voices", body: "Each client brand keeps its own voice and schedule, so drafts for one account do not read like another." },
      { heading: "Approval before posting", body: "Drafts can wait for a human sign-off. Nothing publishes until someone approves it." },
      { heading: "Many platforms, one draft", body: "Write once and adapt the post to each connected platform, including X and LinkedIn." },
    ],
    cta: "Get early access for your agency",
  },
  {
    slug: "social-media-automation-for-founders",
    keyword: "social media automation for founders",
    title: "Social Media Automation for Founders | SMM Agent",
    description:
      "Social media automation for founders who would rather build: drafts from your own material, adapted per platform, posted on a schedule you approve.",
    h1: "Social media automation for founders",
    intro:
      "SMM Agent is social media automation for founders: it drafts posts from your own notes and releases, adapts them to each platform, and posts on a schedule you approve.",
    points: [
      { heading: "Drafts from what you already wrote", body: "Feed it changelogs, notes or articles and it turns them into platform-ready posts." },
      { heading: "You stay in control", body: "Review drafts in a queue and approve, edit or reject. Publishing follows your approval mode." },
      { heading: "Bring your own model keys", body: "Use your own model provider keys instead of paying a markup on generation." },
    ],
    cta: "Join the waitlist",
  },
  {
    slug: "ai-social-media-manager-for-small-teams",
    keyword: "AI social media manager for small teams",
    title: "AI Social Media Manager for Small Teams | SMM Agent",
    description:
      "An AI social media manager for small teams without a social hire: drafting, scheduling and review in one place. Join the SMM Agent waitlist.",
    h1: "AI social media manager for small teams",
    intro:
      "SMM Agent is an AI social media manager for small teams that have no dedicated social hire: it drafts, schedules and queues posts for review.",
    points: [
      { heading: "Drafting handled", body: "The agent writes first drafts in your brand voice so nobody starts from a blank page." },
      { heading: "Review queue", body: "Teammates see pending drafts and approve them before they publish." },
      { heading: "Scheduling built in", body: "Approved posts go out at the slots you set, across the platforms you connect." },
    ],
    cta: "Get early access for your team",
  },
  {
    slug: "social-media-cross-posting-tool-for-creators",
    keyword: "social media cross-posting tool for creators",
    title: "Cross-Posting Tool for Creators | SMM Agent",
    description:
      "A social media cross-posting tool for creators: turn one idea into a post for each platform, then review and schedule. Join the SMM Agent waitlist.",
    h1: "Social media cross-posting tool for creators",
    intro:
      "SMM Agent is a social media cross-posting tool for creators: write the idea once and get a version shaped for each connected platform.",
    points: [
      { heading: "One idea, many formats", body: "Length, tone and structure are adapted per platform instead of pasted unchanged." },
      { heading: "Review each version", body: "Look at every platform version before it is scheduled." },
      { heading: "Less reformatting", body: "Spend the time on the idea, not on rewriting it for each network." },
    ],
    cta: "Join the waitlist",
  },
];

export function getBuyerPage(slug: string): BuyerPage | undefined {
  return BUYER_PAGES.find((p) => p.slug === slug);
}
