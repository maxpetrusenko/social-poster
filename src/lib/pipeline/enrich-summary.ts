/**
 * Enrich a story's summary when the RSS feed provides garbage
 * (e.g. HN "Comments.", empty summaries, single-word entries).
 *
 * Fetches the source article and uses OpenAI to generate a real summary.
 * Falls back gracefully — never throws.
 */

import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveOpenAIResponsesRuntime } from "@/lib/model-runtime";

const GARBAGE_SUMMARIES = new Set([
  "comments",
  "comments.",
  "comment",
  "points",
  "link",
]);

export function needsEnrichment(summary: string): boolean {
  if (!summary) return true;
  const trimmed = summary.trim();
  if (trimmed.length < 15) return true;
  if (GARBAGE_SUMMARIES.has(trimmed.toLowerCase())) return true;
  return false;
}

async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SocialPoster/1.0)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function callOpenAI(
  title: string,
  articleText: string,
  existingSummary: string,
  workspaceId?: string | null
): Promise<string> {
  const model = process.env.OPENAI_ENRICH_MODEL || "gpt-4.1-mini";
  const runtime = workspaceId
    ? await resolveOpenAIResponsesRuntime({ workspaceId, slot: "fast", fallbackModel: model })
    : { apiKey: process.env.OPENAI_API_KEY || "", model, source: "env" as const };
  if (!runtime.apiKey) throw new Error("No OPENAI_API_KEY");

  const prompt = `Summarize this article in 2-3 sentences. Focus on the most specific and surprising details — numbers, names, concrete claims. No filler phrases like "worth watching" or "interesting development".

Title: ${title}
${existingSummary && existingSummary.length > 15 ? `RSS Summary: ${existingSummary}` : ""}

Article:
${articleText}

Return ONLY the summary text, no JSON, no formatting.`;

  const result = await callOpenAIResponses<Record<string, unknown>>({
    name: "pipeline-enrich-summary",
    apiKey: runtime.apiKey,
    body: {
      model: runtime.model,
      input: prompt,
    },
    tags: ["pipeline", "enrichment"],
    metadata: {
      source: "pipeline",
      title,
      modelSource: runtime.source,
    },
  });

  const data = result.data;
  const output = Array.isArray(data.output)
    ? (data.output as Array<Record<string, unknown>>)
    : [];
  const textBlock = output.find((block) => block.type === "message");
  const content =
    ((textBlock?.content as Array<Record<string, unknown>>)?.[0]?.text as string) ?? "";
  return content.trim();
}

/**
 * Enrich a story's summary if it's garbage.
 * Returns the enriched summary or the original if enrichment fails/isn't needed.
 */
export async function enrichSummaryIfNeeded(story: {
  title: string;
  summary: string;
  link: string;
}, workspaceId?: string | null): Promise<string> {
  if (!needsEnrichment(story.summary)) return story.summary;
  if (!story.link) return story.summary;

  try {
    const articleText = await fetchArticleText(story.link);
    if (articleText.length < 50) return story.summary;

    const enriched = await callOpenAI(story.title, articleText, story.summary, workspaceId);
    if (enriched && enriched.length > 20) {
      console.log(
        `[enrich] ${story.title.slice(0, 50)}… → ${enriched.length} chars`
      );
      return enriched;
    }
    return story.summary;
  } catch (err) {
    console.warn(
      `[enrich] failed for ${story.link}: ${err instanceof Error ? err.message : err}`
    );
    return story.summary;
  }
}
