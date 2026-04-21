export function normalizePreviewMediaUrls(
  mediaUrls: readonly (string | null | undefined)[],
  maxVisible = 4
) {
  const allMediaUrls = mediaUrls
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter((url) => url.length > 0);

  return {
    allMediaUrls,
    visibleMediaUrls: allMediaUrls.slice(0, maxVisible),
    extraCount: Math.max(allMediaUrls.length - maxVisible, 0),
  };
}
