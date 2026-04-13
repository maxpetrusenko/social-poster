export const POST_CATEGORIES = [
  {
    value: "opinion_take",
    label: "Take / Opinion",
    description: "Strong point of view. Best default lane for X.",
    cadenceHint: "Primary lane",
  },
  {
    value: "product_update",
    label: "Product Update",
    description: "What shipped, what changed, what you learned.",
    cadenceHint: "Primary lane",
  },
  {
    value: "source_share",
    label: "Source Share",
    description: "Interesting article, repo, or post with your framing.",
    cadenceHint: "About weekly",
  },
  {
    value: "hype_future",
    label: "Hype / Future",
    description: "Big trend, market heat, what feels inevitable next.",
    cadenceHint: "Use selectively",
  },
  {
    value: "hiring_signal",
    label: "Hiring / Referral",
    description: "Recruiting, referrals, openings, and ecosystem asks.",
    cadenceHint: "As needed",
  },
] as const;

export type PostCategoryValue = (typeof POST_CATEGORIES)[number]["value"];

export function getPostCategoryMeta(value?: string | null) {
  return POST_CATEGORIES.find((category) => category.value === value) ?? null;
}
