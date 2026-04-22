import "server-only";

export async function isEmailAllowedForAuth(email?: string | null) {
  return Boolean(email?.trim());
}
