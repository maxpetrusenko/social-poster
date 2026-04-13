"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function UnauthorizedSessionReset() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.signOut();
  }, []);

  return null;
}
