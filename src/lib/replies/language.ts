export const REPLY_LANGUAGE_OPTIONS = ["en", "any"] as const;
export type ReplyLanguage = (typeof REPLY_LANGUAGE_OPTIONS)[number];

const ENGLISH_COMMON_WORDS = new Set([
  "a",
  "about",
  "agent",
  "ai",
  "all",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "but",
  "can",
  "code",
  "data",
  "for",
  "from",
  "have",
  "how",
  "if",
  "in",
  "is",
  "it",
  "like",
  "more",
  "not",
  "of",
  "on",
  "one",
  "open",
  "or",
  "people",
  "product",
  "that",
  "the",
  "this",
  "to",
  "use",
  "what",
  "when",
  "with",
  "you",
]);

const NON_ENGLISH_HINTS = /\b(ada|agar|akan|bisa|buat|dan|dari|dengan|dipake|dipakai|isi|ingfo|itu|jadi|kalau|kayak|ke|ngambil|ngeklik|nyari|rilis|untuk|yg|yang)\b/i;

export function normalizeReplyLanguage(value?: string | null): ReplyLanguage {
  return value === "any" ? "any" : "en";
}

export function getReplyLanguageLabel(language: ReplyLanguage) {
  return language === "en" ? "English" : "Any language";
}

export function detectReplyLanguage(text: string): "en" | "other" {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\w_]+/g, " ");
  const words = normalized.match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

  if (words.length < 4) return "en";
  if (NON_ENGLISH_HINTS.test(normalized)) return "other";

  const commonEnglishCount = words.filter((word) =>
    ENGLISH_COMMON_WORDS.has(word)
  ).length;
  return commonEnglishCount / words.length >= 0.16 ? "en" : "other";
}

export function isReplyLanguageAllowed(
  text: string,
  language: ReplyLanguage
) {
  return language === "any" || detectReplyLanguage(text) === "en";
}
