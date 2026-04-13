"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Play, Trash2 } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { POST_CATEGORIES, getPostCategoryMeta } from "@/lib/post-categories";
import {
  buildScheduleConfig,
  serializeAdvancedScheduleConfig,
} from "@/lib/schedule-config";

type ScheduleRecord = {
  id: string;
  name: string;
  description: string | null;
  cron: string;
  cronHuman: string | null;
  jobType: string;
  profileId: string | null;
  targetPlatformIds: string[] | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
};

type ProfileOption = {
  id: string;
  name: string;
};

type PlatformOption = {
  id: string;
  name: string;
  handle: string | null;
};

type RunRecord = {
  id: string;
  status: string;
  trigger: string;
  startedAt: string | Date;
  error: string | null;
};

const JOB_TYPES = [
  { value: "text_post", label: "Text Post" },
  { value: "image_post", label: "Image Post" },
  { value: "avatar_video", label: "Avatar Video" },
  { value: "reply_engine", label: "X Reply Engine" },
];

const CRON_EXAMPLES = [
  { label: "Every day at 9 AM", value: "0 9 * * *" },
  { label: "Every weekday at 9 AM", value: "0 9 * * 1-5" },
  { label: "Every Monday at 8:30 AM", value: "30 8 * * 1" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
];

export function EditScheduleForm({
  schedule,
  profiles,
  platforms,
  runs,
}: {
  schedule: ScheduleRecord;
  profiles: ProfileOption[];
  platforms: PlatformOption[];
  runs: RunRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningManual, setRunningManual] = useState(false);
  const [form, setForm] = useState({
    name: schedule.name,
    description: schedule.description ?? "",
    cron: schedule.cron,
    jobType: schedule.jobType,
    contentCategory: String(schedule.config?.contentCategory || "opinion_take"),
    advancedConfigText: serializeAdvancedScheduleConfig(schedule.config),
    profileId: schedule.profileId ?? "",
    targetPlatformIds: schedule.targetPlatformIds ?? [],
    enabled: schedule.enabled,
  });

  function togglePlatform(platformId: string, nextChecked: boolean) {
    setForm((current) => ({
      ...current,
      targetPlatformIds: nextChecked
        ? [...current.targetPlatformIds, platformId]
        : current.targetPlatformIds.filter((id) => id !== platformId),
    }));
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();

    if (!form.name.trim() || !form.cron.trim()) {
      alert("Please fill in required fields");
      return;
    }

    setSubmitting(true);

    try {
      const config = buildScheduleConfig({
        contentCategory: form.contentCategory,
        advancedConfigText: form.advancedConfigText,
        baseConfig: schedule.config,
      });

      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update schedule");
      }

      setEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Error updating schedule:", error);
      alert("Failed to update schedule");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRunNow() {
    if (!confirm("Run this schedule now?")) return;

    setRunningManual(true);

    try {
      const response = await fetch(`/api/schedules/${schedule.id}/run`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to run schedule");
      }

      router.refresh();
    } catch (error) {
      console.error("Error running schedule:", error);
      alert("Failed to run schedule");
    } finally {
      setRunningManual(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this schedule? This cannot be undone.")) return;

    try {
      const response = await fetch(`/api/schedules/${schedule.id}/delete`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to delete schedule");
      }

      router.push("/dashboard/schedules");
      router.refresh();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      alert("Failed to delete schedule");
    }
  }

  return (
    <div className="p-6">
      <Link
        href="/dashboard/schedules"
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Schedules
      </Link>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                {schedule.name}
              </h1>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              ) : null}
            </div>

            {editing ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Cron Expression *
                  </label>
                  <input
                    type="text"
                    value={form.cron}
                    onChange={(event) =>
                      setForm({ ...form, cron: event.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  />
                  <div className="mt-3 text-xs text-gray-600 space-y-1">
                    <p className="font-medium">Examples:</p>
                    {CRON_EXAMPLES.map((example) => (
                      <button
                        key={example.value}
                        type="button"
                        onClick={() =>
                          setForm({ ...form, cron: example.value })
                        }
                        className="block text-indigo-600 hover:text-indigo-700"
                      >
                        {example.label}:{" "}
                        <span className="font-mono">{example.value}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Job Type *
                  </label>
                  <select
                    value={form.jobType}
                    onChange={(event) =>
                      setForm({ ...form, jobType: event.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  >
                    {JOB_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Content Category
                  </label>
                  <select
                    value={form.contentCategory}
                    onChange={(event) =>
                      setForm({ ...form, contentCategory: event.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  >
                    {POST_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Advanced Config JSON
                  </label>
                  <textarea
                    value={form.advancedConfigText}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        advancedConfigText: event.target.value,
                      })
                    }
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Use for fixed campaigns, per-platform copy, and per-platform media.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Profile
                  </label>
                  <select
                    value={form.profileId}
                    onChange={(event) =>
                      setForm({ ...form, profileId: event.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                  >
                    <option value="">Select a profile</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-3">
                    Target Platforms
                  </label>
                  <div className="space-y-2">
                    {platforms.map((platform) => (
                      <label
                        key={platform.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.targetPlatformIds.includes(platform.id)}
                          onChange={(event) =>
                            togglePlatform(platform.id, event.target.checked)
                          }
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-900">
                          {platform.name}
                          {platform.handle ? ` (${platform.handle})` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) =>
                      setForm({ ...form, enabled: event.target.checked })
                    }
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-900">Enabled</span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Cron</p>
                    <p className="font-mono text-sm text-gray-900 mt-1">
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
                    <p className="text-sm text-gray-900 capitalize mt-1">
                      {schedule.jobType.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Category</p>
                    <p className="text-sm text-gray-900 mt-1">
                      {getPostCategoryMeta(String(schedule.config?.contentCategory || ""))?.label || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Targets</p>
                    <p className="text-sm text-gray-900 mt-1">
                      {schedule.targetPlatformIds?.length ?? 0} platforms
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="text-sm text-gray-900 mt-1">
                      {schedule.enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                </div>

                {schedule.description ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Description</p>
                    <p className="text-sm text-gray-700">
                      {schedule.description}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 mb-4">Actions</p>
            <div className="space-y-2">
              <button
                onClick={handleRunNow}
                disabled={runningManual}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {runningManual ? "Queueing..." : "Run Now"}
              </button>
              <button
                onClick={handleDelete}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 mb-4">
              Recent Runs
            </p>
            {runs.length === 0 ? (
              <p className="text-xs text-gray-500">No runs yet</p>
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div key={run.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-900 capitalize">
                        {run.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {relativeTime(run.startedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 capitalize">
                      {run.trigger}
                    </p>
                    {run.error ? (
                      <p className="text-xs text-red-600 mt-2">{run.error}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
