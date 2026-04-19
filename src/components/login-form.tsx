"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

function getVerifyErrorMessage(error?: string) {
  if (error === "missing_token") return "Magic link is missing a token";
  if (error === "invalid_or_expired") return "Magic link is invalid or expired";
  return "";
}

export function LoginForm({
  initialError,
  embedded = false,
}: {
  initialError?: string;
  embedded?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const verifyErrorMessage = getVerifyErrorMessage(initialError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setPreviewUrl(data.previewUrl ?? null);
      setSent(true);
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
    }
  }

  const content = sent ? (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
      <p className="text-sm font-medium text-gray-900">Check your email</p>
      <p className="mt-2 text-xs text-gray-500">
        We sent a sign-in link to {email}. It expires in 15 minutes.
      </p>
      {previewUrl ? (
        <div className="mt-4 rounded-md bg-amber-50 p-3 text-left">
          <p className="text-xs font-medium text-amber-900">
            SMTP not configured. Use this local magic link:
          </p>
          <a
            href={previewUrl}
            className="mt-2 block break-all text-xs text-amber-700 underline"
          >
            {previewUrl}
          </a>
        </div>
      ) : null}
    </div>
  ) : (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-6"
    >
      <h1 className="mb-1 text-sm font-medium text-gray-900">Sign in</h1>
      <p className="mb-5 text-xs text-gray-500">
        Enter your email to receive a magic link.
      </p>

      <label className="mb-1 block text-xs font-medium text-gray-700">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="max@example.com"
        className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {(error || verifyErrorMessage) && (
        <p className="mb-3 text-xs text-red-600">
          {error || verifyErrorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send magic link"}
      </button>
    </form>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Share2 className="h-6 w-6 text-indigo-600" />
          <span className="text-lg font-semibold tracking-tight">
            ClawPoster
          </span>
        </div>

        {content}
      </div>
    </div>
  );
}
