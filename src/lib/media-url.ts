export type ResolvedMediaType = "image" | "video";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm"];

export function mediaTypeFromContentType(contentType: string | null | undefined): ResolvedMediaType | null {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  return null;
}

export function mediaTypeFromUrl(url: string): ResolvedMediaType | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    try {
      parsed = new URL(url, "https://social-poster.local");
    } catch {
      return null;
    }
  }

  const pathname = parsed.pathname.toLowerCase();
  const queryFormat = parsed.searchParams.get("format")?.toLowerCase();
  const queryName = parsed.searchParams.get("name")?.toLowerCase();
  const extension =
    queryFormat ||
    [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].find((candidate) =>
      pathname.endsWith(`.${candidate}`)
    ) ||
    (queryName && [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(queryName) ? queryName : null);

  if (!extension) return null;
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (VIDEO_EXTENSIONS.includes(extension)) return "video";
  return null;
}

export function isRenderableMediaUrl(url: string) {
  return mediaTypeFromUrl(url) !== null;
}
