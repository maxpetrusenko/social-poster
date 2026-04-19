export function normalizeNativePlatform(platform: string) {
  const normalized = platform.toLowerCase();
  if (normalized === "linkedin") return "linkedin_personal";
  if (normalized === "x") return "twitter";
  return normalized;
}
