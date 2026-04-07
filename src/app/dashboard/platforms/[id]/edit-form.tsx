"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  buildPlatformConfig,
  PLATFORM_OPTIONS,
  readPlatformConfig,
} from "@/lib/platforms";

type Platform = {
  id: string;
  name: string;
  type: string;
  handle: string | null;
  accountId: string | null;
  provider: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
};

export default function EditPlatformForm({ platform }: { platform: Platform }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configState = readPlatformConfig(platform.config);

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

      const res = await fetch(`/api/platforms/${platform.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update platform");
      }

      router.push("/dashboard/platforms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this platform?")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/platforms/${platform.id}/delete`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete platform");
      }

      router.push("/dashboard/platforms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setDeleting(false);
    }
  };

  return (
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
          defaultValue={platform.name}
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
          defaultValue={platform.type}
          required
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
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
          defaultValue={platform.handle || ""}
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
          defaultValue={platform.accountId || ""}
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
          defaultValue={platform.provider}
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
            defaultChecked={platform.enabled}
            className="w-4 h-4 border border-gray-200 rounded focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-900 font-medium">Enable this platform</span>
        </label>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Platform Skills
        </label>
        <textarea
          name="skills"
          rows={4}
          defaultValue={configState.skillsText}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
        />
        <p className="text-xs text-gray-500 mt-1">
          One skill per line. Edit per platform.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Platform Notes
        </label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={configState.notes}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
        />
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Advanced Config JSON
        </label>
        <textarea
          name="advancedConfig"
          rows={8}
          defaultValue={configState.advancedConfigText}
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
          {loading ? "Saving..." : "Save Changes"}
        </button>
        <Link
          href="/dashboard/platforms"
          className="px-4 py-2 bg-white border border-gray-200 text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </form>
  );
}
