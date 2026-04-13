"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { POST_CATEGORIES } from "@/lib/post-categories";
import { buildScheduleConfig } from "@/lib/schedule-config";

type ProfileOption = {
  id: string;
  name: string;
};

type PlatformOption = {
  id: string;
  name: string;
  handle: string | null;
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
  { label: "Every 30 minutes", value: "*/30 * * * *" },
];

export function NewScheduleForm({
  profiles,
  platforms,
  initialCategory = "opinion_take",
}: {
  profiles: ProfileOption[];
  platforms: PlatformOption[];
  initialCategory?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    cron: "0 9 * * *",
    jobType: "text_post",
    contentCategory: initialCategory,
    advancedConfigText: "",
    profileId: profiles[0]?.id ?? "",
    targetPlatformIds: [] as string[],
    enabled: true,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.name.trim() || !form.cron.trim() || !form.profileId) {
      alert("Please fill in all required fields");
      return;
    }

    setSubmitting(true);

    try {
      const config = buildScheduleConfig({
        contentCategory: form.contentCategory,
        advancedConfigText: form.advancedConfigText,
      });

      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create schedule");
      }

      const { id } = await response.json();
      router.push(`/dashboard/schedules/${id}`);
      router.refresh();
    } catch (error) {
      console.error("Error creating schedule:", error);
      alert("Failed to create schedule");
    } finally {
      setSubmitting(false);
    }
  }

  function togglePlatform(platformId: string, nextChecked: boolean) {
    setForm((current) => ({
      ...current,
      targetPlatformIds: nextChecked
        ? [...current.targetPlatformIds, platformId]
        : current.targetPlatformIds.filter((id) => id !== platformId),
    }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl bg-white border border-gray-200 rounded-lg p-6"
    >
      <div className="space-y-4">
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
            placeholder="e.g., Daily News Post"
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
            placeholder="What does this schedule do?"
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
            placeholder="0 9 * * *"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
          />
          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p className="font-medium">Examples:</p>
            {CRON_EXAMPLES.map((example) => (
              <button
                key={example.value}
                type="button"
                onClick={() => setForm({ ...form, cron: example.value })}
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
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
              Recommended mix
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Mostly <strong>Take / Opinion</strong> and <strong>Product Update</strong>. Keep{" "}
              <strong>Source Share</strong> to about once a week.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Advanced Config JSON
          </label>
          <textarea
            value={form.advancedConfigText}
            onChange={(event) =>
              setForm({ ...form, advancedConfigText: event.target.value })
            }
            placeholder={`{\n  "postMode": "fixed",\n  "rotationMode": "calendar_week",\n  "rotationAnchorDate": "2026-04-16T14:30:00-04:00",\n  "contentVariantsByPlatform": {\n    "twitter": ["Short take"],\n    "linkedin": ["Longer take"]\n  },\n  "mediaUrlByPlatform": {\n    "twitter": "https://example.com/og.jpg",\n    "linkedin": "https://example.com/og.jpg"\n  },\n  "mediaUrlVariantsByPlatform": {\n    "instagram": ["/campaigns/referral/story-01.png", "/campaigns/referral/story-02.png"]\n  },\n  "instagramContentTypeByPlatform": {\n    "instagram": "story"\n  }\n}`}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
          />
          <p className="mt-2 text-xs text-gray-500">
            Optional. Use for fixed campaigns, per-platform copy, and per-platform media.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Profile *
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
          {platforms.length === 0 ? (
            <p className="text-xs text-gray-500 mt-2">
              No platforms available. Add one first.
            </p>
          ) : null}
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
          <span className="text-sm text-gray-900">Enable immediately</span>
        </label>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Schedule"}
          </button>
        </div>
      </div>
    </form>
  );
}
