"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  DashboardHero,
  DashboardPageContent,
  HeroButton,
  SectionCard,
} from "@/components/dashboard/ui";

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
    <DashboardPageContent className="max-w-[980px]">
      <DashboardHero
        eyebrow="Profiles"
        title="New profile"
        description="Create a reusable brand identity with voice, face, tone, and workspace defaults."
        actions={
          <HeroButton href="/dashboard/profiles" tone="ghost">
            Profiles
          </HeroButton>
        }
      />

      <SectionCard
        title="Identity details"
        subtitle="These values become the defaults for campaigns and generated content that use this profile."
        action={
          <Link
            href="/dashboard/profiles"
            aria-label="Back to profiles"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      >
          {error && (
            <div className="mb-6 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Profile Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Max Petrusenko"
                required
                className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-tech)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Bio
              </label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                placeholder="Describe this profile..."
                rows={4}
                className="w-full resize-none rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-tech)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Avatar URL
              </label>
              <input
                type="url"
                name="avatarUrl"
                value={formData.avatarUrl}
                onChange={handleChange}
                placeholder="https://example.com/avatar.jpg"
                className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-tech)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Voice ID
              </label>
              <input
                type="text"
                name="voiceId"
                value={formData.voiceId}
                onChange={handleChange}
                placeholder={DEFAULT_VOICE_ID}
                className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 font-mono text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-tech)]"
              />
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Cartesia voice identifier
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Face ID
              </label>
              <input
                type="text"
                name="faceId"
                value={formData.faceId}
                onChange={handleChange}
                placeholder={DEFAULT_FACE_ID}
                className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 font-mono text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-tech)]"
              />
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Simli face identifier
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Tone
              </label>
              <select
                name="tone"
                value={formData.tone}
                onChange={handleChange}
                className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-tech)]"
              >
                {TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3">
              <input
                type="checkbox"
                name="isDefault"
                id="isDefault"
                checked={formData.isDefault}
                onChange={handleChange}
                className="h-4 w-4 cursor-pointer rounded border border-[rgba(12,17,21,0.18)]"
              />
              <label
                htmlFor="isDefault"
                className="cursor-pointer text-sm font-semibold text-[var(--ink)]"
              >
                Set as default profile
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-[rgba(12,17,21,0.08)] pt-6 sm:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--sand)] transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {loading ? "Creating..." : "Create Profile"}
              </button>
              <Link
                href="/dashboard/profiles"
                className="inline-flex flex-1 items-center justify-center rounded-[12px] border border-[rgba(12,17,21,0.10)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] transition"
              >
                Cancel
              </Link>
            </div>
          </form>
      </SectionCard>
    </DashboardPageContent>
  );
}
