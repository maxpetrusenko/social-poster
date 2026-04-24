import type { SocialAgentContext } from "@/lib/social-agent/context";

type RecentPost = SocialAgentContext["recentPosts"][number];

const POST_STATUS_PATTERNS = [
  /\bdid\b.*\b(post|publish|posted|published)\b/,
  /\bwas\b.*\b(post|publish|posted|published)\b/,
  /\b(post|publish|posted|published)\b.*\b(success|successful|successfully|fail|failed|status)\b/,
  /\bcheck\b.*\b(post|publish|posted|published)\b/,
];

export function isPostPublishStatusQuestion(message: string) {
  const lowered = message.toLowerCase();
  if (lowered.includes("reply") || lowered.includes("replies")) return false;
  return POST_STATUS_PATTERNS.some((pattern) => pattern.test(lowered));
}

export function formatLatestPostPublishStatus(context: Pick<SocialAgentContext, "recentPosts" | "pipelineRuns">) {
  const latestPost = context.recentPosts[0];
  if (!latestPost) return "No recent posts found in this workspace.";

  const title = latestPost.title?.trim() || "Untitled post";
  const targets = latestPost.targets;
  const published = targets.filter((target) => target.status === "published" || Boolean(target.publishedUrl));
  const failed = targets.filter((target) => target.status === "failed" || Boolean(target.error));
  const waiting = targets.filter((target) =>
    ["pending", "publishing", "skipped"].includes(target.status)
  );

  if (!targets.length) {
    return withRecentRun(
      `Latest post "${title}" is ${labelStatus(latestPost.status)}, but it has no platform targets yet.`,
      context,
      latestPost
    );
  }

  if (published.length === targets.length && failed.length === 0) {
    return [
      `Yes. Latest post "${title}" published to ${platformList(published)}.`,
      linkList(published),
    ].filter(Boolean).join("\n");
  }

  if (published.length > 0 && failed.length > 0) {
    return [
      `Partially. Latest post "${title}" published to ${platformList(published)}, but ${platformList(failed)} failed.`,
      failureList(failed),
      linkList(published),
    ].filter(Boolean).join("\n");
  }

  if (failed.length > 0 && published.length === 0) {
    return [
      `No. Latest post "${title}" did not publish successfully.`,
      failureList(failed),
    ].filter(Boolean).join("\n");
  }

  if (waiting.length > 0) {
    return `Not yet. Latest post "${title}" is ${labelStatus(latestPost.status)}; targets are ${targetStatusList(targets)}.`;
  }

  return withRecentRun(
    `Latest post "${title}" is ${labelStatus(latestPost.status)}; targets are ${targetStatusList(targets)}.`,
    context,
    latestPost
  );
}

function withRecentRun(
  base: string,
  context: Pick<SocialAgentContext, "pipelineRuns">,
  post: RecentPost
) {
  const title = post.title?.trim() || null;
  const run = context.pipelineRuns.find((candidate) =>
    title ? candidate.postTitle === title : !candidate.postTitle
  );
  if (!run) return base;

  const runText = punctuate(`Latest run: ${labelStatus(run.status)}${run.error ? `, ${run.error}` : ""}`);
  return `${base}\n${runText}`;
}

function platformList(targets: RecentPost["targets"]) {
  return targets.map((target) => target.platformLabel).join(", ");
}

function targetStatusList(targets: RecentPost["targets"]) {
  return targets
    .map((target) => `${target.platformLabel} ${labelStatus(target.status)}`)
    .join(", ");
}

function failureList(targets: RecentPost["targets"]) {
  const failures = targets.filter((target) => target.error);
  if (!failures.length) return "";

  return `Failures: ${failures
    .map((target) => `${target.platformLabel}: ${target.error}`)
    .join("; ")}`;
}

function linkList(targets: RecentPost["targets"]) {
  const links = targets.filter((target) => target.publishedUrl);
  if (!links.length) return "";

  return `Links: ${links
    .map((target) => `${target.platformLabel}: ${target.publishedUrl}`)
    .join("; ")}`;
}

function labelStatus(status: string) {
  return status.replace(/_/g, " ");
}

function punctuate(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
