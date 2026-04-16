import { NextResponse } from "next/server";
import { extractOpenGraphImageFromHtml } from "@/lib/open-graph-image";

export const dynamic = "force-dynamic";

function extractOgTitle(html: string): string | null {
  const patterns = [
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function extractOgDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i,
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get("url");

  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  try {
    const response = await fetch(parsed, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { imageUrl: null, title: null, description: null, host: parsed.hostname },
        {
          headers: {
            "Cache-Control": "public, max-age=600, s-maxage=3600",
          },
        }
      );
    }

    const html = await response.text();
    const imageUrl = extractOpenGraphImageFromHtml(html, sourceUrl);
    const title = extractOgTitle(html);
    const description = extractOgDescription(html);

    return NextResponse.json(
      {
        imageUrl,
        title,
        description: description
          ? description.length > 200
            ? `${description.slice(0, 197)}…`
            : description
          : null,
        host: parsed.hostname.replace(/^www\./, ""),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { imageUrl: null, title: null, description: null, host: parsed.hostname },
      {
        headers: { "Cache-Control": "public, max-age=600" },
      }
    );
  }
}
