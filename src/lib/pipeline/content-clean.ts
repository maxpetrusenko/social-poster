const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function cleanRichText(value: string): string {
  let current = value;

  for (let index = 0; index < 3; index += 1) {
    const decoded = decodeHtmlEntities(current);
    const withoutComments = decoded.replace(/<!--[\s\S]*?-->/g, " ");
    const withoutScripts = withoutComments
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");

    if (withoutTags === current) {
      current = decoded;
      break;
    }

    current = withoutTags;
  }

  return decodeHtmlEntities(current)
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    return NAMED_ENTITIES[normalized] ?? match;
  });
}
