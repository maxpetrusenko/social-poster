import { db } from "@/db";
import { schedules } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ScheduleEnabledToggle } from "@/components/schedule-enabled-toggle";

export default async function SchedulesPage() {
  const items = await db
    .select()
    .from(schedules)
    .orderBy(desc(schedules.createdAt));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
        <Link
          href="/dashboard/schedules/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Schedule
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 mb-4">
            No schedules yet. Create one to automate your content.
          </p>
          <Link
            href="/dashboard/schedules/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Schedule
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((schedule) => (
            <div
              key={schedule.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">
                    <Link
                      href={`/dashboard/schedules/${schedule.id}`}
                      className="hover:text-indigo-600"
                    >
                      {schedule.name}
                    </Link>
                  </h3>
                  {schedule.description ? (
                    <p className="text-sm text-gray-600 mt-1">
                      {schedule.description}
                    </p>
                  ) : null}
                </div>
                <ScheduleEnabledToggle
                  id={schedule.id}
                  enabled={schedule.enabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Cron</p>
                  <p className="font-mono text-xs text-gray-900">
                    {schedule.cron}
                  </p>
                  {schedule.cronHuman ? (
                    <p className="text-xs text-gray-600 mt-1">
                      {schedule.cronHuman}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="text-xs text-gray-900 capitalize">
                    {schedule.jobType.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
