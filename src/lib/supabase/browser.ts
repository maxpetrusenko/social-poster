"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./config";

export interface SupabaseBrowserConfig {
  url: string;
  anonKey: string;
}

export function createSupabaseBrowserClient(config?: SupabaseBrowserConfig) {
  const { url, anonKey } = config ?? getSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
