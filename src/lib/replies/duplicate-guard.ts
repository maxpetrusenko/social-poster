export function normalizeReplyText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isDuplicateReplyError(error?: string | null): boolean {
  if (!error) return false;

  const normalized = error.toLowerCase();
  return (
    normalized.includes("status is a duplicate") ||
    normalized.includes("failed to post reply: authorization: status is a duplicate") ||
    normalized.includes("(187)") ||
    normalized.includes("duplicate")
  );
}

export function uniqueReplyDrafts(drafts: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const draft of drafts) {
    const normalized = normalizeReplyText(draft);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(draft.trim().replace(/\s+/g, " "));
  }

  return unique;
}

export function filterUntriedReplyDrafts(
  drafts: string[],
  attemptedTexts: Iterable<string>
): string[] {
  const attempted = new Set<string>();

  for (const text of attemptedTexts) {
    const normalized = normalizeReplyText(text);
    if (normalized) attempted.add(normalized);
  }

  return uniqueReplyDrafts(drafts).filter((draft) => !attempted.has(normalizeReplyText(draft)));
}
