import type { PipelineStep } from "@/db/schema";

export function finalizeAbandonedSteps(steps: PipelineStep[] | null | undefined, error: string): PipelineStep[] {
  if (!steps || steps.length === 0) return [];

  const completedAt = new Date().toISOString();

  return steps.map((step) => {
    if (step.status !== "running") return step;

    const startedAt = step.startedAt || completedAt;

    return {
      ...step,
      status: "failed",
      error,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  });
}
