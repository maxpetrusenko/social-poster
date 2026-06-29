import "server-only";

import { generateBlogAutomationPost, hasGeneratedSince, publishBlogAutomationPost } from "./automation";

export type BlogAutomationCadence = "daily" | "weekly";
export type BlogAutomationPublishMode = "review" | "publish";

export function isDailyBlogAutomationEnabled() {
  return process.env.BLOG_AUTOMATION_DAILY_ENABLED === "true";
}

export function getDailyBlogTopic() {
  return (
    process.env.BLOG_AUTOMATION_TOPIC_PROMPT ||
    "the highest-value source-of-truth article SMM Agent should publish today for founders automating social media"
  );
}

export function getBlogAutomationCadence(): BlogAutomationCadence {
  return process.env.BLOG_AUTOMATION_CADENCE === "daily" ? "daily" : "weekly";
}

export function getBlogAutomationPublishMode(): BlogAutomationPublishMode {
  return process.env.BLOG_AUTOMATION_PUBLISH_MODE === "publish" ? "publish" : "review";
}

export function getBlogAutomationWindowStart(now: Date, cadence = getBlogAutomationCadence()) {
  const start = new Date(now);
  if (cadence === "daily") {
    start.setHours(0, 0, 0, 0);
    return start;
  }

  start.setDate(start.getDate() - 7);
  return start;
}

export async function runDailyBlogAutomation(now = new Date()) {
  if (!isDailyBlogAutomationEnabled()) {
    return { skipped: true, reason: "disabled" };
  }

  const cadence = getBlogAutomationCadence();
  if (await hasGeneratedSince(getBlogAutomationWindowStart(now, cadence))) {
    return { skipped: true, reason: cadence === "daily" ? "already_generated_today" : "already_generated_this_week" };
  }

  const result = await generateBlogAutomationPost({
    topic: getDailyBlogTopic(),
    targetWords: readTargetWords(),
    trigger: "daily",
  });

  if (getBlogAutomationPublishMode() !== "publish") {
    return { skipped: false, publishSkipped: true, publishSkipReason: "review_mode", ...result };
  }

  if (result.validation.status === "fail") {
    return { skipped: false, publishSkipped: true, publishSkipReason: "validation_failed", ...result };
  }

  const publish = await publishBlogAutomationPost(result.postId);
  return { skipped: false, publishSkipped: false, publish, ...result };
}

function readTargetWords() {
  const value = Number(process.env.BLOG_AUTOMATION_TARGET_WORDS ?? 2200);
  return Number.isFinite(value) && value >= 1200 && value <= 4000 ? value : 2200;
}
