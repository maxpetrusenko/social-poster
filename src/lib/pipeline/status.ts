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

type PublishResultLike = {
  success: boolean;
  classification?: string;
};

function getActionableResults(results: PublishResultLike[]) {
  return results.filter((result) => result.classification !== "disabled");
}

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
  results: PublishResultLike[]
): Exclude<RunStatus, "running"> {
  const actionable = getActionableResults(results);
  return actionable.length > 0 && actionable.every((result) => result.success)
    ? "completed"
    : "failed";
}

export function resolvePostStatusFromTargetResults(
  results: PublishResultLike[]
): PostStatus {
  const actionable = getActionableResults(results);

  if (actionable.length === 0) {
    return "failed";
  }

  const successCount = actionable.filter((result) => result.success).length;
  if (successCount === actionable.length) {
    return "published";
  }

  if (successCount > 0) {
    return "partial_failure";
  }

  return "failed";
}
