type RunStatus = "running" | "completed" | "failed";
type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial_failure"
  | "failed";
type PipelineStepLike = {
  name?: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  error?: string;
};

export function resolvePipelineRunStatus(input: {
  status: string;
  steps?: PipelineStepLike[] | null;
  error?: string | null;
}): RunStatus {
  if (input.status === "running") return "running";
  if (input.error) return "failed";

  const steps = input.steps ?? [];
  if (
    steps.some(
      (step) => step.status === "failed" || (step.status === "skipped" && Boolean(step.error))
    )
  ) {
    return "failed";
  }

  return input.status === "failed" ? "failed" : "completed";
}

export function resolvePublishResultsStatus(
  results: Array<{ success: boolean }>
): Exclude<RunStatus, "running"> {
  return results.length > 0 && results.every((result) => result.success)
    ? "completed"
    : "failed";
}

export function resolvePostStatusFromTargetResults(
  results: Array<{ success: boolean }>
): PostStatus {
  if (results.length === 0) {
    return "failed";
  }

  const successCount = results.filter((result) => result.success).length;
  if (successCount === results.length) {
    return "published";
  }

  if (successCount > 0) {
    return "partial_failure";
  }

  return "failed";
}
