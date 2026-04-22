export function cleanUrlHost(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function humanizeFormatLabel(format: string | null | undefined) {
  const cleaned = (format || "").trim().replace(/[_-]+/g, " ");
  if (!cleaned) return null;
  return cleaned.replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseThreadChunks(content: string | null | undefined) {
  const paragraphs = (content || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length < 2) return null;

  const chunks = paragraphs.map((paragraph) => {
    const match = paragraph.match(/^(\d+)\/(\d+)\s+([\s\S]+)$/);
    if (!match) return null;
    return {
      index: Number(match[1]),
      total: Number(match[2]),
      content: match[3].trim(),
    };
  });

  if (chunks.some((chunk) => !chunk)) return null;

  const total = chunks[0]?.total ?? 0;
  if (total < 2 || !chunks.every((chunk) => chunk?.total === total)) return null;
  if (chunks.length !== total) return null;

  const ordered = [...chunks].sort((left, right) => left!.index - right!.index);
  if (!ordered.every((chunk, index) => chunk!.index === index + 1)) return null;

  return ordered.map((chunk) => chunk!.content);
}

export function shouldRenderThread({
  content,
  format,
  threadEnabled,
}: {
  content: string | null | undefined;
  format: string | null | undefined;
  threadEnabled?: boolean;
}) {
  return Boolean(
    threadEnabled || (format || "").trim().toLowerCase() === "thread" || parseThreadChunks(content)
  );
}

export function shouldRenderSourceLinkCard({
  sourceUrl,
  mediaUrls,
}: {
  sourceUrl: string | null | undefined;
  mediaUrls: string[];
}) {
  return Boolean(sourceUrl && mediaUrls.length === 0);
}
