import { decodeHtmlEntities } from "@/lib/pipeline/content-clean";
import { safeFetchRemote } from "@/lib/safe-remote-fetch";

export function extractOpenGraphImageFromHtml(
  html: string,
  baseUrl: string
): string | null {
  const image =
    matchMetaContent(html, "property", "og:image") ||
    matchMetaContent(html, "property", "og:image:secure_url") ||
    matchMetaContent(html, "name", "twitter:image") ||
    matchMetaContent(html, "property", "og:image:url");

  if (!image) return null;

  try {
    return new URL(decodeHtmlEntities(image), baseUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchOpenGraphImage(url: string): Promise<string | null> {
  try {
    const res = await safeFetchRemote(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!res?.ok) return null;

    const html = await res.text();
    return extractOpenGraphImageFromHtml(html, url);
  } catch {
    return null;
  }
}

function matchMetaContent(
  html: string,
  attr: "property" | "name",
  value: string
): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]*${attr}=["']${escapeRegex(value)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapeRegex(value)}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
