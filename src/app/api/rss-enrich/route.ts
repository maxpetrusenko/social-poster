import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import { callOpenAIResponses, type LangSmithTrace } from "@/lib/langsmith";
import { resolveOpenAIResponsesRuntime } from "@/lib/model-runtime";

const MODEL = process.env.OPENAI_ENRICH_MODEL || "gpt-4.1-mini";

/**
 * Fetch readable text from a URL.
 * Strips HTML tags, scripts, styles to extract prose.
 */
async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SocialPoster/1.0; +https://github.com/social-poster)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

  const html = await res.text();

  // Strip scripts, styles, and HTML tags
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Take first ~4000 chars (enough for context, within token limits)
  return text.slice(0, 4000);
}

async function generateSummary(
  title: string,
  articleText: string,
  existingSummary: string,
  runtime: { apiKey: string; model: string }
): Promise<{ summary: string; keyPoints: string[]; trace: LangSmithTrace | null }> {
  if (!runtime.apiKey) throw new Error("OPENAI_API_KEY not set");

  const prompt = `You are summarizing an article for social media posts. Extract the most interesting, specific, and substantive points.

Title: ${title}
${existingSummary ? `RSS Summary: ${existingSummary}` : ""}

Article content:
${articleText}

Respond with JSON only:
{
  "summary": "2-3 sentence summary focusing on the most specific and interesting details (numbers, names, concrete claims). No filler like 'worth watching' or 'interesting development'.",
  "keyPoints": ["point 1 - most surprising/specific detail", "point 2 - concrete implication or number", "point 3 - what actually changed"]
}`;

  const result = await callOpenAIResponses<Record<string, unknown>>({
    name: "rss-enrich-summary",
    apiKey: runtime.apiKey,
    body: {
      model: runtime.model,
      input: prompt,
      text: { format: { type: "json_object" } },
    },
    tags: ["rss", "enrichment"],
    metadata: {
      endpoint: "POST /api/rss-enrich",
      title,
    },
  });

  const data = result.data;

  // Extract text from the response
  const output = Array.isArray(data.output)
    ? (data.output as Array<Record<string, unknown>>)
    : [];
  const textBlock = output.find((block) => block.type === "message");
  const content = textBlock
    ? ((textBlock.content as Array<Record<string, unknown>>)?.[0]?.text as string) ?? ""
    : "";

  try {
    const parsed = JSON.parse(content) as { summary: string; keyPoints: string[] };
    return {
      summary: parsed.summary || "",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      trace: result.trace,
    };
  } catch {
    // If JSON parse fails, use the raw text as summary
    return { summary: content.slice(0, 500), keyPoints: [], trace: result.trace };
  }
}

export async function POST(request: NextRequest) {
  const authorized = await requireApiWorkspaceEditor();
  if (authorized instanceof NextResponse) return authorized;

  try {
    const body = (await request.json()) as {
      url?: string;
      title?: string;
      summary?: string;
    };

    if (!body.url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const articleText = await fetchArticleText(body.url);

    if (articleText.length < 50) {
      return NextResponse.json(
        { error: "Could not extract article content" },
        { status: 422 }
      );
    }

    const runtime = await resolveOpenAIResponsesRuntime({
      workspaceId: authorized.currentWorkspace.id,
      slot: "fast",
      fallbackModel: MODEL,
    });
    const result = await generateSummary(
      body.title || "",
      articleText,
      body.summary || "",
      runtime
    );

    await recordTenantAuditEvent(authorized, {
      action: "llm.rss_enrich",
      targetType: "llm",
      metadata: {
        status: "success",
        endpoint: "POST /api/rss-enrich",
        sourceUrl: body.url,
        model: runtime.model,
        modelSource: runtime.source,
        langsmithTrace: result.trace,
      },
    });

    return NextResponse.json({
      summary: result.summary,
      keyPoints: result.keyPoints,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rss-enrich] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
