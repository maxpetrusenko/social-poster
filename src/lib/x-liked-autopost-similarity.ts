/**
 * Check if repost text is almost identical to source (avoid redundant source links)
 */

/**
 * Calculate normalized similarity between two texts
 * Returns 0.0 (completely different) to 1.0 (identical)
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const normalized1 = normalizeForComparison(text1);
  const normalized2 = normalizeForComparison(text2);

  if (normalized1 === normalized2) return 1.0;
  if (!normalized1 && !normalized2) return 1.0; // Both empty = identical
  if (!normalized1 || !normalized2) return 0.0; // One empty = different

  // Use word-level Jaccard similarity (better for text comparison than character-level)
  const words1 = normalized1.split(/\s+/).filter(Boolean);
  const words2 = normalized2.split(/\s+/).filter(Boolean);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Normalize text for comparison (lowercase, remove URLs, punctuation, whitespace)
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, "") // Remove URLs
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Check if repost should include source link based on similarity
 * 
 * @param repostText - The rewritten/reposted text
 * @param sourceText - The original source text
 * @param threshold - Similarity threshold (0.0-1.0), default 0.75
 * @returns true if source link should be included (texts are meaningfully different)
 */
export function shouldIncludeSourceLink(
  repostText: string,
  sourceText: string,
  threshold = 0.75
): boolean {
  const similarity = calculateTextSimilarity(repostText, sourceText);
  
  // If similarity is above threshold, texts are too similar - skip source link
  return similarity < threshold;
}
