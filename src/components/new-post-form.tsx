"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  name: string;
};

type Platform = {
  id: string;
  name: string;
  handle: string | null;
};

export function NewPostForm({
  profiles,
  platforms,
}: {
  profiles: Profile[];
  platforms: Platform[];
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    contentType: "text",
    sourceUrl: "",
    scheduledAt: "",
    profileId: "",
    platformIds: [] as string[],
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePlatformToggle = (platformId: string) => {
    setFormData((prev) => ({
      ...prev,
      platformIds: prev.platformIds.includes(platformId)
        ? prev.platformIds.filter((id) => id !== platformId)
        : [...prev.platformIds, platformId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to create post");
        return;
      }

      const result = await response.json();
      router.push(`/dashboard/posts/${result.id}`);
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Failed to create post");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-1">
          Title (optional)
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          placeholder="Post title"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
        />
      </div>

      {/* Content */}
      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-900 mb-1">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          value={formData.content}
          onChange={handleChange}
          placeholder="Write your post content..."
          rows={6}
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent resize-none"
        />
      </div>

      {/* Content Type */}
      <div>
        <label htmlFor="contentType" className="block text-sm font-medium text-gray-900 mb-1">
          Content Type
        </label>
        <select
          id="contentType"
          name="contentType"
          value={formData.contentType}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
        >
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="avatar_video">Avatar Video</option>
        </select>
      </div>

      {/* Source URL */}
      <div>
        <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-900 mb-1">
          Source URL (optional)
        </label>
        <input
          type="url"
          id="sourceUrl"
          name="sourceUrl"
          value={formData.sourceUrl}
          onChange={handleChange}
          placeholder="https://example.com"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
        />
      </div>

      {/* Schedule */}
      <div>
        <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-900 mb-1">
          Schedule (optional)
        </label>
        <input
          type="datetime-local"
          id="scheduledAt"
          name="scheduledAt"
          value={formData.scheduledAt}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
        />
      </div>

      {/* Profile */}
      {profiles.length > 0 && (
        <div>
          <label htmlFor="profileId" className="block text-sm font-medium text-gray-900 mb-1">
            Profile
          </label>
          <select
            id="profileId"
            name="profileId"
            value={formData.profileId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
          >
            <option value="">Select a profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Platforms */}
      {platforms.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-3">
            Target Platforms
          </label>
          <div className="space-y-2">
            {platforms.map((platform) => (
              <label key={platform.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.platformIds.includes(platform.id)}
                  onChange={() => handlePlatformToggle(platform.id)}
                  className="w-4 h-4 border border-gray-200 rounded text-indigo-600 focus:ring-2 focus:ring-indigo-600"
                />
                <span className="text-sm text-gray-700">
                  {platform.name}
                  {platform.handle && (
                    <span className="text-xs text-gray-500 ml-1">
                      {platform.handle}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Creating..." : "Create Post"}
        </button>
      </div>
    </form>
  );
}
