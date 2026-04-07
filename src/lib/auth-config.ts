export const AUTH_DISABLED = process.env.DISABLE_AUTH !== "false";
export const ALLOWED_EMAIL =
  process.env.AUTH_EMAIL ?? "max.petrusenko@gmail.com";
export const SESSION_COOKIE = "sp_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
