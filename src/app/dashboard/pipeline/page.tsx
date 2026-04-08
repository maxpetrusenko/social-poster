import { db } from "@/db";
import { pipelineRuns, schedules } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "running":
      return <Clock className="h-5 w-5 text-amber-600" />;
    default:
      return <Clock className="h-5 w-5 text-gray-400" />;
  }
}

function getDuration(run: {
  durationMs: number | null;
  completedAt: Date | null;
  startedAt: Date;
}) {
  if (run.durationMs) {
    return `${Math.round(run.durationMs / 1000)}s`;
  }

  if (run.completedAt) {
    const seconds = Math.round(
      (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) /
        1000
    );
    return `${seconds}s`;
  }

  return "–";
}

export default async function PipelinePage() {
  const runs = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(50);

  const scheduleIds = Array.from(
    new Set(runs.map((run) => run.scheduleId).filter(Boolean))
  ) as string[];
  const scheduleRows =
    scheduleIds.length > 0
      ? await db.select().from(schedules).where(inArray(schedules.id, scheduleIds))
      : [];
  const scheduleMap = new Map(scheduleRows.map((schedule) => [schedule.id, schedule]));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pipeline Runs</h1>

      {runs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500">
            No pipeline runs yet. Create a schedule to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const schedule = run.scheduleId
              ? scheduleMap.get(run.scheduleId)
              : null;

            return (
              <details
                key={run.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden group"
              >
                <summary className="list-none cursor-pointer p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(run.status)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">
                          {schedule?.name ?? "Manual Run"}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {run.trigger === "manual" && "Manual"}
                          {run.trigger === "cron" && "Scheduled"}
                          {run.trigger === "api" && "API"} ·{" "}
                          {relativeTime(run.startedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <div className="text-xs font-medium text-gray-900">
                        {getDuration(run)}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {run.status}
                      </div>
                    </div>
                  </div>
                </summary>

                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  {run.steps && run.steps.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Steps
                      </p>
                      {run.steps.map((step, index) => (
                        <div
                          key={`${run.id}-${index}`}
                          className="bg-white border border-gray-200 rounded p-3"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="font-medium text-sm text-gray-900">
                              {step.name}
                            </div>
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded capitalize">
                              {step.status}
                            </span>
                          </div>
                          {step.durationMs ? (
                            <div className="text-xs text-gray-500 mb-2">
                              Duration: {Math.round(step.durationMs / 1000)}s
                            </div>
                          ) : null}
                          {step.error ? (
                            <div className="text-xs text-red-600 mb-2">
                              Error: {step.error}
                            </div>
                          ) : null}
                          {step.output ? (
                            <div className="text-xs text-gray-600 bg-gray-100 rounded p-2 font-mono overflow-auto max-h-32">
                              {JSON.stringify(step.output, null, 2)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No steps recorded</p>
                  )}

                  {run.error ? (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-xs font-medium text-red-900 mb-1">
                        Error:
                      </p>
                      <p className="text-xs text-red-800">{run.error}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
