export type AuthMode =
  | "bypass"
  | "supabase"
  | "magic_link"
  | "misconfigured";

function isSupabaseEnvConfigured(env: NodeJS.ProcessEnv) {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function resolveAuthMode(
  env: NodeJS.ProcessEnv = process.env
): AuthMode {
  const bypassRequested = env.DISABLE_AUTH === "true";
  const bypassExplicitlyDisabled = env.DISABLE_AUTH === "false";
  const supabaseConfigured = isSupabaseEnvConfigured(env);
  const isProduction = env.NODE_ENV === "production";

  if (isProduction) {
    if (bypassRequested || !bypassExplicitlyDisabled || !supabaseConfigured) {
      return "misconfigured";
    }

    return "supabase";
  }

  if (bypassRequested) {
    return "bypass";
  }

  if (supabaseConfigured) {
    return "supabase";
  }

  return "magic_link";
}

export function getAuthConfigError(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (resolveAuthMode(env) !== "misconfigured") {
    return null;
  }

  if (env.NODE_ENV === "production" && env.DISABLE_AUTH === "true") {
    return "Production auth bypass is forbidden. Set DISABLE_AUTH=false.";
  }

  if (env.NODE_ENV === "production" && env.DISABLE_AUTH !== "false") {
    return "Production auth must explicitly set DISABLE_AUTH=false.";
  }

  if (!isSupabaseEnvConfigured(env)) {
    return "Supabase auth is required in production. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }

  return "Authentication is misconfigured.";
}

export const AUTH_MODE = resolveAuthMode();
export const AUTH_DISABLED = AUTH_MODE === "bypass";
export const ALLOWED_EMAIL =
  process.env.AUTH_EMAIL ?? "max.petrusenko@gmail.com";
export const SESSION_COOKIE = "sp_session";
export const BYPASS_SIGNED_OUT_COOKIE = "sp_bypass_signed_out";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export function isBypassSignedOutCookieValue(value?: string | null) {
  return value === "1";
}
