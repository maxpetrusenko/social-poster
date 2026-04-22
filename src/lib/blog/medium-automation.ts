import "server-only";

import { buildReviewFallbackDraft, extractFirstMarkdownImage, type BlogDraft } from "./framework";

type MediumAutomationResponse = {
  success?: boolean;
  articleId?: string;
  topic?: string;
  article?: string;
  savedPath?: string | null;
  actualWords?: number;
  research?: {
    provider?: string;
    model?: string;
    sources?: string[];
    sourcesCount?: number;
    findings?: Array<{ title?: string; url?: string; source?: string; content?: string }>;
  };
  images?: {
    files?: Array<{ original?: string; local?: string; path?: string }>;
  };
  usage?: Record<string, unknown>;
};

export function getMediumAutomationConfig() {
  const apiUrl = process.env.MEDIUM_AUTOMATION_API_URL?.replace(/\/+$/, "") || "";
  const apiKey = process.env.MEDIUM_AUTOMATION_API_KEY || "";
  return {
    apiUrl,
    hasApiKey: Boolean(apiKey),
    configured: Boolean(apiUrl && apiKey),
    apiKey,
  };
}

export async function generateBlogDraftWithMediumAutomation(input: {
  topic: string;
  targetWords: number;
  sourceUrls?: string[];
}): Promise<{ draft: BlogDraft; provider: "medium-automation" | "fallback"; raw?: unknown }> {
  const config = getMediumAutomationConfig();

  if (!config.configured) {
    return {
      draft: buildReviewFallbackDraft(input),
      provider: "fallback",
    };
  }

  const response = await fetch(`${config.apiUrl}/api/articles/streamlined`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({
      topic: buildSourceTruthPrompt(input.topic, input.sourceUrls),
      length: input.targetWords,
      save: true,
    }),
    signal: AbortSignal.timeout(240_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Medium automation failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const result = (await response.json()) as MediumAutomationResponse;
  const article = result.article?.trim();
  if (!article) {
    throw new Error("Medium automation returned no article content.");
  }

  const title = extractTitle(article) || input.topic;
  const directAnswer = extractDirectAnswer(article);
  const image = extractFirstMarkdownImage(article);
  const sources = extractSources(result, input.sourceUrls);

  return {
    provider: "medium-automation",
    raw: result,
    draft: {
      topic: input.topic,
      title,
      excerpt: buildExcerpt(article),
      category: "Automation",
      directAnswer,
      thesis: extractThesis(article, input.topic),
      contentMarkdown: article,
      heroImageUrl: image?.url ?? null,
      heroImageAlt: image?.alt ?? null,
      sources,
      targetWords: input.targetWords,
      mediumArticleId: result.articleId ?? null,
      externalDraftPath: result.savedPath ?? null,
      metadata: {
        generator: "medium-automation",
        research: result.research ?? null,
        images: result.images ?? null,
        usage: result.usage ?? null,
        actualWords: result.actualWords ?? null,
      },
    },
  };
}

function buildSourceTruthPrompt(topic: string, sourceUrls?: string[]) {
  const sourceBlock = sourceUrls?.length
    ? `\nUse these source URLs as required evidence candidates:\n${sourceUrls.join("\n")}`
    : "";

  return `${topic}

Create the single source-of-truth article for this topic. Include:
- a 40-60 word direct answer blockquote immediately after the title
- real primary-source links for factual claims
- one misconception or tension resolved through the article
- narrative insight, structured steps, definitions, examples, comparison, checklist, FAQ, and conclusion loop
- at least one mistake, limitation, rollback, or counterexample
- one primary action and two or three secondary actions
- one relevant image in Markdown
- never use the forbidden phrase supplied by the editor${sourceBlock}`;
}

function extractTitle(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

function extractDirectAnswer(markdown: string) {
  const afterTitle = markdown.replace(/^#\s+.+\n+/m, "").trimStart();
  const quoteLines = afterTitle
    .split("\n")
    .filter((line) => line.trim().startsWith(">"))
    .map((line) => line.replace(/^>\s?/, "").trim());
  return quoteLines.join(" ").trim();
}

function extractThesis(markdown: string, fallback: string) {
  const match = markdown.match(/##\s+(?:Thesis|Thesis And Tension|Tension)[\s\S]*?\n\n([\s\S]*?)(?:\n\n##|$)/i);
  const paragraph = match?.[1]?.replace(/\n/g, " ").trim();
  return paragraph || `Source-of-truth article for ${fallback}.`;
}

function buildExcerpt(markdown: string) {
  const text = markdown
    .replace(/^# .+$/gm, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/[#>*_`-]/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 180);
}

function extractSources(result: MediumAutomationResponse, sourceUrls?: string[]) {
  const urls = new Set<string>();
  const sources: BlogDraft["sources"] = [];

  for (const url of sourceUrls ?? []) {
    if (!/^https?:\/\//.test(url) || urls.has(url)) continue;
    urls.add(url);
    sources.push({ title: new URL(url).hostname, url });
  }

  for (const url of result.research?.sources ?? []) {
    if (!/^https?:\/\//.test(url) || urls.has(url)) continue;
    urls.add(url);
    sources.push({ title: safeHostname(url), url });
  }

  for (const finding of result.research?.findings ?? []) {
    const url = finding.url || finding.source;
    if (!url || !/^https?:\/\//.test(url) || urls.has(url)) continue;
    urls.add(url);
    sources.push({ title: finding.title || safeHostname(url), url });
  }

  return sources.slice(0, 12);
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Source";
  }
}
