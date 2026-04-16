import { NextRequest, NextResponse } from "next/server";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_ENRICH_MODEL || "gpt-4.1-mini";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return key;
}

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
  existingSummary: string
): Promise<{ summary: string; keyPoints: string[] }> {
  const apiKey = getApiKey();

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

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

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
    };
  } catch {
    // If JSON parse fails, use the raw text as summary
    return { summary: content.slice(0, 500), keyPoints: [] };
  }
}

export async function POST(request: NextRequest) {
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

    const result = await generateSummary(
      body.title || "",
      articleText,
      body.summary || ""
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rss-enrich] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
