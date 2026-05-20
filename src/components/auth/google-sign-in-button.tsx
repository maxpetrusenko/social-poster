"use client";

import { useMemo, useState } from "react";
import {
  createSupabaseBrowserClient,
  type SupabaseBrowserConfig,
} from "@/lib/supabase/browser";
import { getWorkspaceAuthErrorMessage } from "@/lib/supabase/config";

interface GoogleSignInButtonProps {
  initialErrorCode?: string | null;
  nextPath?: string;
  supabase: SupabaseBrowserConfig;
}

export function GoogleSignInButton({
  initialErrorCode = null,
  nextPath = "/dashboard",
  supabase: supabaseConfig,
}: GoogleSignInButtonProps) {
  const supabase = useMemo(
    () => createSupabaseBrowserClient(supabaseConfig),
    [supabaseConfig]
  );
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(
    initialErrorCode === "unauthorized"
  );

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }

  async function handleSignIn() {
    setGoogleLoading(true);
    setError(null);
    setAccessDenied(false);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
      },
    });

    if (signInError) {
      setError(signInError.message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={googleLoading}
        className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-semibold text-[#08111d] shadow-[0_16px_40px_rgba(8,17,29,0.18)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
      >
        <span
          aria-hidden="true"
          className="mr-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" role="img">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-6.9 0-.7-.1-1.5-.2-2.2H12Z"
            />
            <path
              fill="#34A853"
              d="M12 21.5c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.5-4l-3.2 2.5c1.6 3.1 4.8 5.3 8.7 5.3Z"
            />
            <path
              fill="#FBBC05"
              d="M6.5 13.7c-.2-.6-.3-1.1-.3-1.7s.1-1.2.3-1.7L3.3 7.8C2.7 9 2.3 10.5 2.3 12s.4 3 1 4.2l3.2-2.5Z"
            />
            <path
              fill="#4285F4"
              d="M12 6.3c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 3.3 14.6 2.5 12 2.5c-3.9 0-7.1 2.2-8.7 5.3l3.2 2.5c.8-2.3 3-4 5.5-4Z"
            />
          </svg>
        </span>
        {googleLoading ? "Redirecting..." : "Continue with Google"}
      </button>

      {accessDenied ? (
        <p className="text-sm text-[#ffb4a8]">
          {getWorkspaceAuthErrorMessage("unauthorized")}
        </p>
      ) : null}
      {error ? <p className="text-sm text-[#ffb4a8]">{error}</p> : null}
    </div>
  );
}
