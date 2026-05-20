export type BlogSource = {
  title: string;
  url: string;
  publisher?: string;
};

export type BlogDraft = {
  topic: string;
  title: string;
  excerpt: string;
  category: string;
  directAnswer: string;
  thesis: string;
  contentMarkdown: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  sources: BlogSource[];
  targetWords: number;
  mediumArticleId?: string | null;
  mediumUrl?: string | null;
  externalDraftPath?: string | null;
  metadata?: Record<string, unknown>;
};

export type FrameworkCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type FrameworkValidation = {
  status: "pass" | "warn" | "fail";
  score: number;
  checks: FrameworkCheck[];
};

const FORBIDDEN_PHRASES = [
  "This isn't mysticism. It's also not settled science. It's something more interesting.",
  "game changer",
  "worth watching",
  "future proof",
  "best in class",
  "revolutionary",
];

const REALITY_CONTACT_TERMS = [
  "mistake",
  "failure",
  "limitation",
  "rollback",
  "counterexample",
  "risk",
  "trade-off",
  "tradeoff",
  "caveat",
];

export function slugifyBlogTitle(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");

  return slug || `blog-${Date.now()}`;
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function extractFirstMarkdownImage(markdown: string): {
  url: string;
  alt: string;
} | null {
  const match = markdown.match(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/i);
  if (!match?.[2]) return null;
  return { alt: match[1] || "Article hero image", url: match[2] };
}

export function validateSourceOfTruthArticle(draft: BlogDraft): FrameworkValidation {
  const checks: FrameworkCheck[] = [];
  const content = draft.contentMarkdown.trim();
  const lowerContent = content.toLowerCase();

  const directAnswerWords = countWords(draft.directAnswer);
  checks.push({
    key: "direct_answer_length",
    label: "Direct answer is 40-60 words",
    status: directAnswerWords >= 40 && directAnswerWords <= 60 ? "pass" : "fail",
    detail: `${directAnswerWords} words`,
  });

  const afterTitle = content
    .replace(/^#\s+.+\n+/m, "")
    .trimStart()
    .startsWith(">");
  checks.push({
    key: "direct_answer_position",
    label: "Direct answer block follows title",
    status: afterTitle ? "pass" : "fail",
    detail: afterTitle ? "First content block is a quote" : "First content block is not a quote",
  });

  const hasPrimarySources =
    draft.sources.length >= 3 &&
    draft.sources.every((source) => /^https?:\/\//.test(source.url));
  checks.push({
    key: "primary_sources",
    label: "Three or more linked sources",
    status: hasPrimarySources ? "pass" : "fail",
    detail: `${draft.sources.length} source(s)`,
  });

  const hasRealityContact = REALITY_CONTACT_TERMS.some((term) =>
    lowerContent.includes(term.toLowerCase())
  );
  checks.push({
    key: "reality_contact",
    label: "Reality contact section is present",
    status: hasRealityContact ? "pass" : "fail",
    detail: hasRealityContact ? "Concrete limitation language found" : "Missing limitation or counterexample",
  });

  const faqMatches = content.match(/^>\s+\*\*(What is|Why does|How does|What are|How do)/gim);
  const faqCount = faqMatches?.length ?? 0;
  const rememberSection = content.match(/(?:^|\n)##[ \t]+What to Remember[ \t]*\n+([\s\S]*?)(?:\n##[ \t]+|$)/i)?.[1] ?? "";
  const rememberCount = rememberSection.match(/^\s*[-*]\s+/gm)?.length ?? 0;
  checks.push({
    key: "faq_graph",
    label: "FAQ answer graph is covered",
    status: faqCount >= 5 || rememberCount >= 4 ? "pass" : faqCount >= 3 || rememberCount >= 3 ? "warn" : "fail",
    detail: faqCount ? `${faqCount}/5 required FAQ blocks` : `${rememberCount}/4 What to Remember bullets`,
  });

  const actionSignals = [
    "Primary action:",
    "Secondary action:",
    "Implementation checklist",
  ];
  const actionContent = content.toLowerCase();
  const actionCount = actionSignals.filter((signal) => actionContent.includes(signal.toLowerCase())).length;
  const hasActionSection = /^##\s+Actions to Take/im.test(content);
  const hasPrimaryAction = /\*\*Primary Action\*\*|Primary action:/i.test(content);
  const hasSecondaryActions = /\*\*Secondary Actions\*\*|Secondary action:/i.test(content);
  const normalizedActionCount = actionCount + (hasActionSection ? 1 : 0) + (hasPrimaryAction ? 1 : 0) + (hasSecondaryActions ? 1 : 0);
  checks.push({
    key: "actionability",
    label: "Primary and secondary actions are explicit",
    status: normalizedActionCount >= 2 ? "pass" : "fail",
    detail: `${normalizedActionCount}/3 action signals`,
  });

  const hasImage = Boolean(draft.heroImageUrl || extractFirstMarkdownImage(content));
  checks.push({
    key: "hero_image",
    label: "Article has an image",
    status: hasImage ? "pass" : "fail",
    detail: hasImage ? "Image URL present" : "Missing hero image",
  });

  const forbiddenHits = FORBIDDEN_PHRASES.filter((phrase) =>
    lowerContent.includes(phrase.toLowerCase())
  );
  checks.push({
    key: "forbidden_phrases",
    label: "Forbidden phrases are absent",
    status: forbiddenHits.length === 0 ? "pass" : "fail",
    detail: forbiddenHits.length ? forbiddenHits.join(", ") : "No hits",
  });

  const score = checks.reduce((total, check) => {
    if (check.status === "pass") return total + 1;
    if (check.status === "warn") return total + 0.5;
    return total;
  }, 0);

  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarn = checks.some((check) => check.status === "warn");

  return {
    status: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    score: Math.round((score / checks.length) * 110),
    checks,
  };
}

export function buildReviewFallbackDraft(input: {
  topic: string;
  targetWords?: number;
  sourceUrls?: string[];
}): BlogDraft {
  const targetWords = input.targetWords ?? 2000;
  const title = `${input.topic}: The Source-of-Truth Draft`;
  const directAnswer =
    "A source-of-truth article is a review-ready page that answers one specific query directly, resolves the core misconception behind it, cites primary evidence, names practical limits, and gives the reader a concrete next action. Its job is to be useful enough for humans and structured enough for AI systems to cite.";
  const sources = (input.sourceUrls ?? []).map((url, index) => ({
    title: `Source ${index + 1}`,
    url,
  }));

  const contentMarkdown = `# ${title}

> ${directAnswer}

![Research desk for ${input.topic}](https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1600&auto=format&fit=crop)

## Thesis And Tension

Most articles about ${input.topic} try to sound complete before the evidence is complete. This draft intentionally starts as a review artifact: the argument, source map, FAQ graph, reality contact, and action steps are laid out before the final prose is approved.

## Evidence Map

${sources.length ? sources.map((source) => `- [${source.title}](${source.url})`).join("\n") : "- Add at least three primary sources before approval."}

## Old Way Vs Source-Of-Truth Way

- Old way: publish a polished opinion, then hunt for sources after objections arrive.
- Source-of-truth way: collect the evidence first, write the direct answer second, then make every section earn its place.

## Reality Contact

The limitation is deliberate: this fallback draft is not pretending to have completed live research. It blocks autopublish until a researched article from Medium automation or a human editor supplies primary sources, a stronger image, and final claims.

## Implementation Checklist

- Primary action: replace this fallback with a researched Medium automation draft or a human-edited article.
- Secondary action: add three primary sources from original docs, studies, official data, or first-hand product experience.
- Secondary action: verify the image rights and alt text before publishing.

## FAQs

> **What is this article supposed to become?** It should become the canonical answer for one narrow reader question, not a generic blog update.

> **Why does it matter?** The structure keeps the draft useful to a human reviewer and parseable by answer engines before publication.

> **How does it work?** The validator checks answer length, source count, reality contact, FAQ coverage, actionability, image presence, and banned phrases.

> **What are the risks or limits?** Weak evidence, stale links, vague claims, and decorative images all keep the draft out of publish-ready state.

> **How do I implement it?** Approve only after the source list, direct answer, image, and final claims survive the checklist.

## Conclusion

The tension was never whether AI can write a post. The tension is whether the article can survive contact with sources, readers, and search systems at the same time.

The draft is not ready when it sounds good. It is ready when removing any section makes the reader less informed.`;

  return {
    topic: input.topic,
    title,
    excerpt: `A review-gated source-of-truth draft for ${input.topic}.`,
    category: "Automation",
    directAnswer,
    thesis: `Resolve the gap between generic content and source-backed authority for ${input.topic}.`,
    contentMarkdown,
    heroImageUrl:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1600&auto=format&fit=crop",
    heroImageAlt: `Research desk for ${input.topic}`,
    sources,
    targetWords,
    metadata: { generator: "fallback-framework" },
  };
}
