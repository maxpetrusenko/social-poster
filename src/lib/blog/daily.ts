import "server-only";

import { generateBlogAutomationPost, hasGeneratedToday } from "./automation";

export function isDailyBlogAutomationEnabled() {
  return process.env.BLOG_AUTOMATION_DAILY_ENABLED === "true";
}

export function getDailyBlogTopic() {
  return (
    process.env.BLOG_AUTOMATION_TOPIC_PROMPT ||
    "the highest-value source-of-truth article SMM Agent should publish today for founders automating social media"
  );
}

export async function runDailyBlogAutomation(now = new Date()) {
  if (!isDailyBlogAutomationEnabled()) {
    return { skipped: true, reason: "disabled" };
  }

  if (await hasGeneratedToday(now)) {
    return { skipped: true, reason: "already_generated_today" };
  }

  const result = await generateBlogAutomationPost({
    topic: getDailyBlogTopic(),
    targetWords: readTargetWords(),
    trigger: "daily",
  });

  return { skipped: false, ...result };
}

function readTargetWords() {
  const value = Number(process.env.BLOG_AUTOMATION_TARGET_WORDS ?? 2200);
  return Number.isFinite(value) && value >= 1200 && value <= 4000 ? value : 2200;
}
