import type { PublicSiteKey } from "@/lib/site-domains";
import { SOURCE_OF_TRUTH_POSTS } from "./source-posts";

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  publishedAt: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  sources?: Array<{ title: string; url: string; publisher?: string }>;
  isMarkdown?: boolean;
  audiences?: PublicSiteKey[];
};

const LEGACY_BLOG_POSTS: BlogPost[] = [
  {
    slug: "ai-agent-posts-while-you-sleep",
    title: "Your AI Agent Posts While You Sleep",
    excerpt: "ClawPoster runs 24/7. Set your schedule, define your voice, and wake up to published content across every platform.",
    category: "Agent",
    publishedAt: "2026-04-18",
    content: `Most founders treat social media like a chore. Open the app, think of something to say, copy-paste it to five platforms, tweak the format, hit publish. Repeat tomorrow. Or more likely, skip tomorrow because you have actual work to do.

ClawPoster is an AI agent that handles all of that. You tell it what matters to your brand — your tone, your topics, your posting cadence. It writes platform-native content, adapts formatting for each network, and publishes on schedule.

The key difference from schedulers: ClawPoster doesn't just queue what you wrote. It generates content based on your brand voice, your RSS feeds, trending topics in your space, and your content calendar. You review and approve in a clean dashboard. Or you let it run fully autonomous.

It connects to X, LinkedIn, Instagram, TikTok, Threads, Bluesky, Facebook, YouTube, Pinterest, Reddit, Mastodon, and more. One agent, every platform. Posts go out at optimal times while you focus on building your product.`,
  },
  {
    slug: "one-post-sixteen-platforms",
    title: "One Idea, Sixteen Platforms",
    excerpt: "Write once, publish everywhere. ClawPoster adapts your content to each platform's native format automatically.",
    category: "Features",
    publishedAt: "2026-04-17",
    content: `A LinkedIn post is not a tweet is not a TikTok caption. Every platform has its own character limits, formatting rules, hashtag culture, and audience expectations. Manually adapting one piece of content to sixteen platforms is tedious and error-prone.

ClawPoster takes a single content idea and rewrites it for each target platform. Your LinkedIn post gets professional formatting with line breaks and a hook. Your tweet gets compressed to fit character limits with the right hashtags. Your Instagram caption gets emoji and calls-to-action. Your Bluesky post stays conversational.

This is not template filling. The AI understands platform norms and adjusts tone, length, structure, and formatting per network. The original insight stays — the delivery changes.

You can review each adapted version before publishing, edit any of them individually, or let the agent handle it end-to-end. The result: consistent brand presence across every platform without the content production bottleneck.`,
  },
  {
    slug: "rss-to-social-pipeline",
    title: "Turn RSS Feeds into Social Content",
    excerpt: "ClawPoster ingests your industry RSS feeds, scores articles, and transforms the best ones into branded social posts.",
    category: "Features",
    publishedAt: "2026-04-16",
    content: `You already read industry news. Your audience should see that you read it too. Sharing relevant articles with your take positions you as informed and engaged. But doing it manually — finding articles, writing commentary, posting across platforms — takes time you don't have.

ClawPoster connects to any RSS feed. It ingests articles, scores them by relevance and traction, deduplicates across sources, and transforms the best candidates into social posts in your brand voice.

The pipeline works like this: feeds are checked on schedule, new articles get scored against your keyword preferences and traction metrics, top candidates get transformed into platform-specific posts with your commentary angle, and everything lands in your approval queue.

You control the voice, the selection criteria, and the posting frequency. The agent handles the rest. One RSS pipeline can keep your social presence stocked with relevant, timely content without you ever opening a news reader.`,
  },
  {
    slug: "brand-voice-memory",
    title: "Your Agent Remembers Your Brand Voice",
    excerpt: "Configure tone, style, and personality once. Every post sounds like you, not like AI.",
    category: "Agent",
    publishedAt: "2026-04-15",
    content: `Generic AI content is obvious. It uses the same phrases, the same structure, the same energy. Your audience can smell it. The whole point of social presence is that it sounds like a real person with real opinions.

ClawPoster profiles let you define exactly how your brand communicates. Set your tone — professional, casual, technical, provocative. Define your topics and angles. Upload examples of posts you like. The agent learns your voice and writes in it consistently.

Each workspace can have multiple profiles. Your personal brand sounds different from your company account. Your technical audience on LinkedIn gets different energy than your Twitter followers.

The profile system covers: name and avatar, bio and positioning, voice tone and style, preferred topics, content templates, and even which platforms each profile targets. Once configured, every generated post carries your brand fingerprint. Not generic. Not robotic. Yours.`,
  },
  {
    slug: "automated-reply-engine",
    title: "Automated Reply Discovery and Drafting",
    excerpt: "ClawPoster finds relevant conversations in your niche and drafts thoughtful replies to grow your presence.",
    category: "Growth",
    publishedAt: "2026-04-14",
    content: `Posting is half the game. The other half is engaging with conversations already happening. Finding relevant tweets, replying thoughtfully, building relationships — that is how accounts grow. But monitoring feeds for opportunities takes hours.

ClawPoster includes a reply engine. It scans conversations in your niche, identifies high-value threads where your input would be relevant, and drafts replies in your brand voice.

Every candidate gets scored for relevance, risk level, and engagement potential. Popular replies from other accounts are analyzed so your draft adds something new rather than repeating what has been said.

You review candidates in a dedicated dashboard. Each one shows the original post, context, a drafted reply, and a risk assessment. Approve, edit, or skip. The approved replies get posted through your connected accounts.

This is not spam. The scoring system filters for quality conversations where genuine expertise adds value. Low-quality or risky threads get filtered out automatically.`,
  },
  {
    slug: "scheduling-cron-content",
    title: "Cron-Based Content Scheduling",
    excerpt: "Set recurring schedules for different content types. Your agent generates and publishes fresh content on autopilot.",
    category: "Features",
    publishedAt: "2026-04-13",
    content: `Most schedulers let you queue specific posts for specific times. That works until you run out of queued content. Then your feed goes silent.

ClawPoster schedules are different. They are recurring jobs. Set "every weekday at 9am, post a tech take on X" and the agent generates a fresh post every morning. Define "every Monday, share the best RSS article from the weekend" and it handles the full pipeline: scan, score, transform, publish.

Schedule types include text posts, image posts, avatar videos, RSS roundups, and reply sessions. Each schedule links to a profile and target platforms. You can run five different schedules at different cadences across different accounts.

The cron system is precise. Human-readable descriptions show what runs when. Execution history tracks every run with step-by-step pipeline logs so you can see exactly what happened — and what went wrong if a run failed. No black boxes.`,
  },
  {
    slug: "multi-platform-dashboard",
    title: "One Dashboard for Every Platform",
    excerpt: "See all your connected accounts, posting health, and scheduled content in a single view.",
    category: "Dashboard",
    publishedAt: "2026-04-12",
    content: `Managing social accounts means juggling multiple tabs, multiple apps, multiple login sessions. Each platform has its own analytics, its own composer, its own scheduling tools. Context-switching between them wastes time and fragments your strategy.

ClawPoster gives you one dashboard for everything. Connect X, LinkedIn, Instagram, TikTok, Threads, Bluesky, Facebook, YouTube, Pinterest, Reddit, Mastodon, Google Business Profile, and WhatsApp. See them all in one view.

The home screen shows platform health at a glance — which accounts are connected, which need attention, recent posting activity, and upcoming scheduled content. The calendar view shows your content pipeline across all platforms on a timeline.

Posts are created once and targeted to multiple platforms. The pipeline page shows execution history with detailed step logs. The reply dashboard shows engagement opportunities across accounts. Everything is one click away instead of scattered across sixteen different apps.`,
  },
  {
    slug: "avatar-video-generation",
    title: "AI Avatar Videos from Text",
    excerpt: "ClawPoster generates talking-head videos using your AI avatar and voice. Real video content, zero camera time.",
    category: "Content",
    publishedAt: "2026-04-11",
    content: `Video content gets more reach than text on every platform. But recording videos takes equipment, editing time, and the willingness to be on camera. Most founders skip video entirely because the production overhead is too high.

ClawPoster generates avatar videos from text. Write your script — or let the agent write it — and get a talking-head video with your AI face and voice. The avatar looks and sounds like you, not like a generic deepfake.

The system uses Simli for face generation and Cartesia for voice synthesis. Configure your face ID and voice ID once in your profile, and every video schedule produces content that looks authentically yours.

Use cases: daily tech takes on TikTok, weekly LinkedIn video updates, product announcements across platforms. The content calendar can mix text posts, image posts, and avatar videos across the same schedule. All automated, all in your brand voice, all published without you touching a camera.`,
  },
  {
    slug: "content-deduplication",
    title: "Never Post the Same Thing Twice",
    excerpt: "Built-in deduplication ensures your feeds stay fresh. No repeated content, no awkward double-posts.",
    category: "Features",
    publishedAt: "2026-04-10",
    content: `When you are pulling content from RSS feeds, generating posts with AI, and running multiple schedules, duplicate content is inevitable without safeguards. Nobody wants to share the same article twice or post the same take on consecutive days.

ClawPoster has deduplication built into the pipeline. Every piece of content gets a dedup key based on its source and substance. Before any post gets published, it is checked against the cache. Duplicates get filtered silently.

This works across the entire pipeline: RSS articles that appear in multiple feeds get caught. AI-generated posts that are too similar to recent content get flagged. Scheduled runs that would produce repetitive output get adjusted.

The dedup cache is persistent and grows over time. The longer ClawPoster runs, the better it gets at keeping your feeds fresh and varied. Combined with the scoring system for RSS candidates, this means your audience sees a curated, non-repetitive stream of relevant content.`,
  },
  {
    slug: "team-workspace-management",
    title: "Multi-Brand Workspaces for Teams",
    excerpt: "Manage multiple brands, invite team members, and control access across workspaces from one account.",
    category: "Teams",
    publishedAt: "2026-04-09",
    content: `Agencies manage multiple client accounts. Companies have multiple brands. Even solo founders often have a personal brand and a company account that need different voices and strategies.

ClawPoster supports multi-tenant workspaces. Create an organization, add workspaces for each brand or client, and configure each one independently. Different profiles, different connected platforms, different schedules, different brand voices.

Team members get invited via email with role-based access. Viewers can see content and analytics. Editors can create and modify posts. Admins can manage connections and settings. The organization owner controls everything.

Each workspace is isolated. Client A cannot see Client B's content, accounts, or analytics. But you as the agency owner can switch between workspaces instantly from the same dashboard. Audit logs track who did what across all workspaces for accountability and compliance.

This is the same architecture that enterprise social tools charge thousands per month for, built into ClawPoster from day one.`,
  },
];

export const BLOG_POSTS: BlogPost[] = [
  ...SOURCE_OF_TRUTH_POSTS,
  ...LEGACY_BLOG_POSTS,
];
