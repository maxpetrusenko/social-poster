import { redirect } from "next/navigation";
import { AUTH_MODE, getAuthConfigError } from "@/lib/auth-config";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { UnauthorizedSessionReset } from "@/components/auth/unauthorized-session-reset";
import { LoginForm } from "@/components/login-form";
import {
  getWorkspaceAuthErrorMessage,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowedForAuth } from "@/lib/auth-allowlist";

export const metadata = {
  title: "Dashboard Sign In",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
}

function sanitizeNextPath(candidate?: string | null) {
  if (!candidate || !candidate.startsWith("/")) {
    return "/dashboard";
  }

  return candidate.startsWith("/auth") ? "/dashboard" : candidate;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (AUTH_MODE === "bypass") {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : undefined;
  const nextPath = sanitizeNextPath(params?.next);
  const authErrorCode = params?.error ?? null;

  let shouldResetSession = false;

  if (AUTH_MODE === "supabase" && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (await isEmailAllowedForAuth(user?.email)) {
      redirect(nextPath);
    }

    if (user) {
      shouldResetSession = true;
    }
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#f2ecdf]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(232,126,67,0.2),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(14,96,108,0.18),transparent_24%),linear-gradient(180deg,#f2ecdf_0%,#e8dcc6_100%)]" />
      <div className="absolute left-[-8rem] top-24 h-64 w-64 rounded-full bg-[#d86d36]/20 blur-3xl" />
      <div className="absolute right-[-6rem] top-12 h-72 w-72 rounded-full bg-[#0c5f6b]/18 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-8 md:px-6 md:py-12">
        <section className="w-full max-w-md rounded-[32px] bg-[#221a16] p-6 text-[#f6ecdc] shadow-[0_16px_40px_rgba(34,26,22,0.18)] md:p-7">
          {shouldResetSession ? <UnauthorizedSessionReset /> : null}
          <p className="section-eyebrow text-[#d2a35d]">Private Dashboard</p>
          <h1 className="mt-3 font-serif text-[2rem] leading-none text-[#f6ecdc]">
            Social Agent
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#cbbba7]">
            Google-gated admin for posting, schedules, pipeline, replies.
          </p>

          <div className="mt-6">
            {AUTH_MODE === "supabase" && isSupabaseConfigured() ? (
              <GoogleSignInButton
                initialErrorCode={authErrorCode}
                nextPath={nextPath}
              />
            ) : AUTH_MODE === "magic_link" ? (
              <LoginForm
                initialError={authErrorCode ?? undefined}
                embedded
              />
            ) : AUTH_MODE === "misconfigured" ? (
              <div className="rounded-[22px] border border-[#d86d36]/24 bg-[#352720] p-4 text-sm leading-7 text-[#ffd7bf]">
                {getAuthConfigError() ?? "Authentication is misconfigured."}
              </div>
            ) : (
              <div className="rounded-[22px] border border-[#d86d36]/24 bg-[#352720] p-4 text-sm leading-7 text-[#ffd7bf]">
                {getWorkspaceAuthErrorMessage("missing-config")}
                <div className="mt-2 text-xs text-[#e8cbb6]">
                  Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                  <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
                </div>
              </div>
            )}
          </div>

          {authErrorCode &&
          authErrorCode !== "unauthorized" &&
          AUTH_MODE === "supabase" &&
          isSupabaseConfigured() ? (
            <p className="mt-4 text-sm text-[#ffb4a8]">
              {getWorkspaceAuthErrorMessage(authErrorCode)}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
