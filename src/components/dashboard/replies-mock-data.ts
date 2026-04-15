export type ReplyStatus = "new" | "analyzed" | "drafted" | "ready" | "posted" | "skipped";
export type ViewMode = "replies1" | "replies2";

export type ReplyCard = {
  id: string;
  profileName: string;
  replyProfileLabel?: string | null;
  author: string;
  tweetUrl: string;
  replyUrl: string;
  mediaUrl?: string | null;
  status: ReplyStatus;
  title: string;
  hook: string;
  score: number;
  risk: "low" | "medium";
  repliesScraped: number;
  updatedLabel: string;
  readyAtLabel?: string | null;
  publishStateLabel?: string | null;
  tags: string[];
  bestAngle: string;
  why: string;
  shouldMentionProduct: "soft" | "no" | "yes";
  postedAt: string;
  engagement: {
    replies: number;
    likes: number;
    views: string;
  };
  thread: string[];
  popularReplies: Array<{
    author: string;
    handle: string;
    text: string;
    likes: number;
  }>;
  drafts: string[];
};

export const INITIAL_CARDS: ReplyCard[] = [
  {
    id: "builder-z",
    profileName: "Builder Z",
    author: "@builder_z",
    tweetUrl: "https://x.com/builder_z/status/1940061000000000001",
    replyUrl: "https://x.com/builder_z/status/1940062000000000001",
    status: "drafted",
    title: "Most chatbot products still fake continuity across sessions.",
    hook: "Memory and identity are still getting collapsed into one bucket.",
    score: 88,
    risk: "low",
    repliesScraped: 14,
    updatedLabel: "8m ago",
    tags: ["chatbots", "memory", "continuity"],
    bestAngle: "Stronger frame",
    why: "Builder conversation. Real thread depth. Clear opening to add a sharper distinction without sounding like a pitch bot.",
    shouldMentionProduct: "soft",
    postedAt: "11:54 AM · today",
    engagement: {
      replies: 14,
      likes: 63,
      views: "9.1K",
    },
    thread: [
      "Root: Most chatbot products still fake continuity across sessions.",
      "Reply: Teams keep shipping chat history and calling it identity.",
      "Reply: Real continuity is preference, pacing, and trust memory.",
      "Reply: Most demos break once the user returns three days later.",
    ],
    popularReplies: [
      {
        author: "Nadia Sol",
        handle: "@nadiasol",
        text: "Most teams call long chat history continuity. The user can feel the difference immediately.",
        likes: 18,
      },
      {
        author: "Maksim Dev",
        handle: "@maksimdev",
        text: "The weird part is when the bot remembers facts but completely changes tone the next day.",
        likes: 11,
      },
      {
        author: "Agent Loops",
        handle: "@agentloops",
        text: "Continuity without receipts gets spooky fast once the system adapts incorrectly.",
        likes: 9,
      },
    ],
    drafts: [
      "most teams are still treating memory like identity. the harder layer is stable behavior and preference structure across sessions. we’re building around that gap.",
      "chat history is the easy part. continuity gets real once the system has to preserve pacing, preferences, and failure style after context resets.",
      "this is where receipts matter. if the bot can’t show why it adapted to this user, continuity turns into theater fast.",
    ],
  },
  {
    id: "saas-ops",
    profileName: "SaaS Ops",
    author: "@saas_ops",
    tweetUrl: "https://x.com/saas_ops/status/1940061000000000002",
    replyUrl: "https://x.com/saas_ops/status/1940062000000000002",
    status: "ready",
    title: "Support bots usually fail when context shifts mid-thread.",
    hook: "The bot sounds smart until the customer changes the frame.",
    score: 79,
    risk: "low",
    repliesScraped: 31,
    updatedLabel: "22m ago",
    tags: ["support bot", "handoff", "context"],
    bestAngle: "How to do it better",
    why: "Useful operator angle. We can speak concretely about context shifts and adaptation quality.",
    shouldMentionProduct: "yes",
    postedAt: "10:37 AM · today",
    engagement: {
      replies: 31,
      likes: 102,
      views: "14.8K",
    },
    thread: [
      "Root: Support bots usually fail when context shifts mid-thread.",
      "Reply: They get trapped in the workflow they started with.",
      "Reply: Handoff gets worse because the thread summary is flat.",
      "Reply: The user feels unseen even when the facts are right.",
    ],
    popularReplies: [
      {
        author: "CX Jane",
        handle: "@cxjane",
        text: "The reset feeling is what kills trust. Users think they need to retrain the bot every turn.",
        likes: 21,
      },
      {
        author: "Helpdesk Guy",
        handle: "@helpdeskguy",
        text: "Support bots do okay in one lane. They break once billing turns into urgency or frustration.",
        likes: 17,
      },
      {
        author: "Infra PM",
        handle: "@infrapm",
        text: "Most handoffs are just flattened summaries. That’s the real problem.",
        likes: 12,
      },
    ],
    drafts: [
      "the failure usually starts before the handoff. the bot locks onto the first inferred intent and never rebuilds the user model when the conversation shifts.",
      "yeah. most systems save facts, not interaction strategy. that’s why the bot feels rigid as soon as the user changes tone or goal.",
      "we’ve found the fix is treating user state as live structure, not a summary blob. otherwise every shift feels like a reset.",
    ],
  },
  {
    id: "founder-x",
    profileName: "Founder X",
    author: "@founder_x",
    tweetUrl: "https://x.com/founder_x/status/1940061000000000003",
    replyUrl: "https://x.com/founder_x/status/1940062000000000003",
    status: "new",
    title: "We just launched an AI assistant for real estate lead capture.",
    hook: "Early launch thread with replies about bad qualification flows.",
    score: 81,
    risk: "medium",
    repliesScraped: 23,
    updatedLabel: "12m ago",
    tags: ["sales bot", "real estate", "lead gen"],
    bestAngle: "Ask a builder question",
    why: "Strong fit. Live founder thread. Best move is helpful question first, not immediate product mention.",
    shouldMentionProduct: "no",
    postedAt: "11:42 AM · today",
    engagement: {
      replies: 23,
      likes: 44,
      views: "7.3K",
    },
    thread: [
      "Root: We just launched an AI assistant for real estate lead capture.",
      "Reply: How do you stop it from sounding like a scripted rep?",
      "Reply: Does it adapt between first time buyers and investors?",
      "Reply: Most bots over-qualify and miss emotional context.",
    ],
    popularReplies: [
      {
        author: "Leah Broker",
        handle: "@leahbroker",
        text: "Every real estate bot I’ve tested feels too scripted for nervous first-time buyers.",
        likes: 16,
      },
      {
        author: "Sales Stack",
        handle: "@salesstack",
        text: "Qualification before trust is exactly the mistake. The user hasn’t earned the funnel yet.",
        likes: 10,
      },
      {
        author: "Property Nerd",
        handle: "@propertynerd",
        text: "Different buyer types need different pacing. Prompt switches alone won’t fix that.",
        likes: 8,
      },
    ],
    drafts: [
      "curious if you’re separating first time buyers from repeat investors at the behavior layer or only in prompts. that split usually changes the whole conversation flow.",
      "interesting launch. most real estate bots miss because they optimize qualification before trust. are you modeling those separately?",
      "the scripted-rep problem usually comes from one generic interaction strategy. different buyer types need different pacing, not just different facts.",
    ],
  },
  {
    id: "team-y",
    profileName: "Team Y",
    author: "@team_y",
    tweetUrl: "https://x.com/team_y/status/1940061000000000004",
    replyUrl: "https://x.com/team_y/status/1940062000000000004",
    status: "analyzed",
    title: "Personalization for chatbots still feels mostly cosmetic.",
    hook: "Thread debating whether personalization is just injected memories.",
    score: 76,
    risk: "low",
    repliesScraped: 8,
    updatedLabel: "34m ago",
    tags: ["personalization", "assistant", "identity"],
    bestAngle: "We build this",
    why: "Good target. Smaller account. Thread stays technical. Product mention can be direct but short.",
    shouldMentionProduct: "soft",
    postedAt: "9:18 AM · today",
    engagement: {
      replies: 8,
      likes: 29,
      views: "4.6K",
    },
    thread: [
      "Root: Personalization for chatbots still feels mostly cosmetic.",
      "Reply: People are just stuffing profiles into prompts.",
      "Reply: There’s no real difference between sessions.",
      "Reply: The bot flatters the user but doesn’t adapt meaningfully.",
    ],
    popularReplies: [
      {
        author: "Memory Labs",
        handle: "@memorylabs",
        text: "Injected profile memory is still just profile memory. The behavior layer is where it breaks.",
        likes: 13,
      },
      {
        author: "Prompt Girl",
        handle: "@promptgirl",
        text: "Cosmetic is right. It feels personalized until the user changes goals.",
        likes: 7,
      },
    ],
    drafts: [
      "agree. most personalization layers are profile paste, not behavioral structure. the system remembers facts but not how to stay the same useful assistant across sessions.",
      "this is exactly the gap we’re building around. memory alone is shallow. stable preferences and interaction strategy are the harder part.",
      "cosmetic is right. if the assistant can’t explain why it responded differently for this user, the personalization probably isn’t real.",
    ],
  },
  {
    id: "agentmaker",
    profileName: "Agentmaker",
    author: "@agentmaker",
    tweetUrl: "https://x.com/agentmaker/status/1940061000000000005",
    replyUrl: "https://x.com/agentmaker/status/1940062000000000005",
    status: "posted",
    title: "Voice agents still sound polished and empty.",
    hook: "Already sent. Good example of high-signal operator reply.",
    score: 73,
    risk: "low",
    repliesScraped: 11,
    updatedLabel: "42m ago",
    tags: ["voice agent", "ux", "trust"],
    bestAngle: "Share test result",
    why: "Posted example. Keep for visual balance and queue lifecycle.",
    shouldMentionProduct: "soft",
    postedAt: "8:03 AM · today",
    engagement: {
      replies: 11,
      likes: 36,
      views: "5.8K",
    },
    thread: [
      "Root: Voice agents still sound polished and empty.",
      "Reply: They sound good but don’t stay grounded.",
      "Reply: They mirror tone instead of understanding stakes.",
    ],
    popularReplies: [
      {
        author: "Voice Ops",
        handle: "@voiceops",
        text: "Believable voice is arriving faster than believable judgment.",
        likes: 15,
      },
      {
        author: "Ari Chen",
        handle: "@arichen",
        text: "The polish makes the miss feel worse, not better.",
        likes: 9,
      },
    ],
    drafts: [
      "the polish gap is obvious now. voice gets believable before judgment does, so trust breaks the second the conversation turns ambiguous.",
    ],
  },
  {
    id: "cx-lead",
    profileName: "CX Lead",
    author: "@cx_lead",
    tweetUrl: "https://x.com/cx_lead/status/1940061000000000006",
    replyUrl: "https://x.com/cx_lead/status/1940062000000000006",
    status: "skipped",
    title: "Anyone else tired of every AI chatbot saying the same things?",
    hook: "Generic complaint thread. Low value-add.",
    score: 55,
    risk: "medium",
    repliesScraped: 7,
    updatedLabel: "1h ago",
    tags: ["chatbot", "fatigue"],
    bestAngle: "Skip",
    why: "Too generic. High chance of low-signal pile-on.",
    shouldMentionProduct: "no",
    postedAt: "7:26 AM · today",
    engagement: {
      replies: 7,
      likes: 19,
      views: "2.1K",
    },
    thread: [
      "Root: Anyone else tired of every AI chatbot saying the same things?",
      "Reply: They all sound like support macros.",
    ],
    popularReplies: [
      {
        author: "Ops Guy",
        handle: "@opsguy",
        text: "Same cadence. Same apology. Same fake empathy.",
        likes: 6,
      },
    ],
    drafts: [
      "the sameness problem usually starts with one universal assistant voice. different user states need different interaction strategies.",
    ],
  },
];

export const STATUS_LABELS: Record<ReplyStatus, string> = {
  new: "New",
  analyzed: "Analyzed",
  drafted: "Drafted",
  ready: "Ready to Post",
  posted: "Posted",
  skipped: "Skipped",
};

export const STATUS_ACCENTS: Record<ReplyStatus, string> = {
  new: "var(--accent-tech)",
  analyzed: "var(--accent-mindfold)",
  drafted: "var(--accent-spirit)",
  ready: "#2563eb",
  posted: "#0f766e",
  skipped: "#7c8a97",
};

export const VIEW_OPTIONS: Array<{ id: ViewMode; label: string; blurb: string }> = [
  { id: "replies1", label: "Replies 1", blurb: "Kanban-first. Inline open card. Fast status moves." },
  { id: "replies2", label: "Replies 2", blurb: "Queue + review drawer. Approve, edit, dispatch." },
];

export const KANBAN_ORDER: ReplyStatus[] = ["new", "analyzed", "drafted", "ready", "posted"];
