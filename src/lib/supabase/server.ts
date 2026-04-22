import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseServerEnv } from "./config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey, storageKey } = getSupabaseServerEnv();

  return createServerClient(url, anonKey, {
    auth: {
      storageKey,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components cannot always mutate cookies. The auth callback handles writes.
        }
      },
    },
  });
}
