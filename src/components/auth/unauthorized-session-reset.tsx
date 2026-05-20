"use client";

import { useMemo, useState } from "react";
import {
  createSupabaseBrowserClient,
  type SupabaseBrowserConfig,
} from "@/lib/supabase/browser";

export function UnauthorizedSessionReset({
  supabase,
}: {
  supabase: SupabaseBrowserConfig;
}) {
  const client = useMemo(() => createSupabaseBrowserClient(supabase), [supabase]);
  const [isResetting, setIsResetting] = useState(false);

  async function handleReset() {
    setIsResetting(true);
    await client.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={isResetting}
      className="mb-4 w-full rounded-2xl border border-[#d86d36]/30 bg-[#352720] px-4 py-3 text-left text-sm font-semibold text-[#ffd7bf] transition hover:border-[#ffb084] disabled:cursor-wait disabled:opacity-70"
    >
      {isResetting ? "Signing out..." : "Use a different Google account"}
    </button>
  );
}
