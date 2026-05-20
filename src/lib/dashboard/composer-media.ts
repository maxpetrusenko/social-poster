import { mediaTypeFromUrl } from "@/lib/media-url";
import type { ImageSpec } from "@/lib/platform-specs";

export function getMissingImageDimensionUrls(
  mediaUrls: string[],
  mediaDimensions: Record<string, ImageSpec>
) {
  return mediaUrls.filter(
    (url) => url && mediaTypeFromUrl(url) !== "video" && !mediaDimensions[url]
  );
}
