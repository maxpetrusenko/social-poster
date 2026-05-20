"use client";

import { useEffect } from "react";
import {
  createSupabaseBrowserClient,
  type SupabaseBrowserConfig,
} from "@/lib/supabase/browser";

export function UnauthorizedSessionReset({
  supabase,
}: {
  supabase: SupabaseBrowserConfig;
}) {
  useEffect(() => {
    const client = createSupabaseBrowserClient(supabase);
    void client.auth.signOut();
  }, [supabase]);

  return null;
}
