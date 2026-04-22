const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const SUPABASE_INTERNAL_URL = process.env.SUPABASE_INTERNAL_URL?.trim() ?? "";

function storageKeyForUrl(url: string) {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "sb-supabase-auth-token";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabasePublicEnv(): {
  url: string;
  anonKey: string;
} {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
}

export function getSupabaseServerEnv(): {
  url: string;
  anonKey: string;
  storageKey: string;
} {
  const env = getSupabasePublicEnv();

  return {
    ...env,
    url: SUPABASE_INTERNAL_URL || env.url,
    storageKey: storageKeyForUrl(env.url),
  };
}

export function getWorkspaceAuthErrorMessage(
  errorCode?: string | null
): string | null {
  switch (errorCode) {
    case "missing-config":
      return "Google auth is not configured yet.";
    case "unauthorized":
      return "That sign-in session is not authorized.";
    case "oauth":
      return "Google sign-in did not complete. Try again.";
    default:
      return null;
  }
}
