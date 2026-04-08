"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "technical", label: "Technical" },
  { value: "conversational", label: "Conversational" },
];

const DEFAULT_VOICE_ID = "7270ea4d-a17a-4f21-a3da-03f2b128669d";
const DEFAULT_FACE_ID = "7bb46589-4be6-4df8-ab80-03443fb75d6f";

export default function NewProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    avatarUrl: "",
    voiceId: DEFAULT_VOICE_ID,
    faceId: DEFAULT_FACE_ID,
    tone: "professional",
    isDefault: false,
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    const checked =
      type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create profile");
      }

      router.push("/dashboard/profiles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/dashboard/profiles"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">New Profile</h1>
            <p className="text-sm text-gray-500 mt-1">
              Create a new brand identity with voice and face settings
            </p>
          </div>
        </div>

        {/* Form Card */}
        <div className="border border-gray-200 rounded-lg p-8 bg-white">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Profile Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Max Petrusenko"
                required
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bio
              </label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                placeholder="Describe this profile..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm resize-none"
              />
            </div>

            {/* Avatar URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Avatar URL
              </label>
              <input
                type="url"
                name="avatarUrl"
                value={formData.avatarUrl}
                onChange={handleChange}
                placeholder="https://example.com/avatar.jpg"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
              />
            </div>

            {/* Voice ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Voice ID
              </label>
              <input
                type="text"
                name="voiceId"
                value={formData.voiceId}
                onChange={handleChange}
                placeholder={DEFAULT_VOICE_ID}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Cartesia voice identifier
              </p>
            </div>

            {/* Face ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Face ID
              </label>
              <input
                type="text"
                name="faceId"
                value={formData.faceId}
                onChange={handleChange}
                placeholder={DEFAULT_FACE_ID}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Simli face identifier
              </p>
            </div>

            {/* Tone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tone
              </label>
              <select
                name="tone"
                value={formData.tone}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
              >
                {TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Is Default */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                name="isDefault"
                id="isDefault"
                checked={formData.isDefault}
                onChange={handleChange}
                className="w-4 h-4 border border-gray-200 rounded cursor-pointer"
              />
              <label
                htmlFor="isDefault"
                className="text-sm text-gray-700 cursor-pointer"
              >
                Set as default profile
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? "Creating..." : "Create Profile"}
              </button>
              <Link
                href="/dashboard/profiles"
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
