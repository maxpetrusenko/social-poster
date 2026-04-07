"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  buildPlatformConfig,
  PLATFORM_OPTIONS,
} from "@/lib/platforms";

export default function NewPlatformPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const data = {
        name: formData.get("name") as string,
        type: formData.get("type") as string,
        handle: (formData.get("handle") as string) || undefined,
        accountId: (formData.get("accountId") as string) || undefined,
        provider: formData.get("provider") as string,
        config: buildPlatformConfig({
          skillsText: (formData.get("skills") as string) || "",
          notes: (formData.get("notes") as string) || "",
          advancedConfigText: (formData.get("advancedConfig") as string) || "",
        }),
        enabled: formData.get("enabled") === "on",
      };

      const res = await fetch("/api/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create platform");
      }

      router.push("/dashboard/platforms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <Link
          href="/dashboard/platforms"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Platforms
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900 mb-6">
          Add New Platform
        </h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Platform Name
            </label>
            <input
              type="text"
              name="name"
              placeholder="e.g., X (Main), LinkedIn Personal"
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Type */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Platform Type
            </label>
            <select
              name="type"
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Select a platform</option>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Handle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Handle
            </label>
            <input
              type="text"
              name="handle"
              placeholder="e.g., @username"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Account ID */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Account ID
            </label>
            <input
              type="text"
              name="accountId"
              placeholder="e.g., zernio-account-123"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Provider account ID used for publishing
            </p>
          </div>

          {/* Provider */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Provider
            </label>
            <select
              name="provider"
              defaultValue="zernio"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="zernio">Zernio</option>
              <option value="bird">Bird</option>
              <option value="direct">Direct</option>
            </select>
          </div>

          {/* Enabled */}
          <div className="mb-8">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="w-4 h-4 border border-gray-200 rounded focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-900 font-medium">Enable this platform</span>
            </label>
          </div>

          {/* Skills */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Platform Skills
            </label>
            <textarea
              name="skills"
              rows={4}
              placeholder={"hooks\nshort-form copy\nvisual captions"}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
            <p className="text-xs text-gray-500 mt-1">
              One skill per line. Stored with this platform.
            </p>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Platform Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Posting workflow, caveats, or operator notes"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
          </div>

          {/* Advanced Config */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Advanced Config JSON
            </label>
            <textarea
              name="advancedConfig"
              rows={8}
              placeholder={'{\n  "image": { "width": 1200, "height": 675 },\n  "tools": ["zernio"]\n}'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating..." : "Create Platform"}
            </button>
            <Link
              href="/dashboard/platforms"
              className="px-4 py-2 bg-white border border-gray-200 text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
