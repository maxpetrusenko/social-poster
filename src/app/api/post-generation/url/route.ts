import { NextRequest, NextResponse } from "next/server";

import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { extractOpenGraphImageFromHtml } from "@/lib/open-graph-image";
import { cleanRichText, decodeHtmlEntities } from "@/lib/pipeline/content-clean";
import { sourceEvidenceStore } from "@/lib/sources/evidence-store.server";
import {
  buildUrlEvidenceSnapshot,
  normalizeUrlEvidenceCandidate,
} from "@/lib/sources/url";
import { isSafeRemoteHttpUrl } from "@/lib/safe-remote-fetch";

const MAX_HTML_BYTES = 1_500_000;

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const sourceUrl = parseHttpUrl(rawUrl);

    if (!sourceUrl) {
      return NextResponse.json({ error: "Paste a valid http or https URL." }, { status: 400 });
    }

    if (!(await isSafeRemoteHttpUrl(sourceUrl))) {
      return NextResponse.json({ error: "That URL is not allowed." }, { status: 400 });
    }

    const response = await fetchReadablePage(sourceUrl);

    if (!response?.ok) {
      return NextResponse.json({ error: "Could not load that URL." }, { status: 422 });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      return NextResponse.json({ error: "That URL is not a readable page." }, { status: 422 });
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const title = extractTitle(html);
    const description = extractDescription(html);
    const articleText = extractArticleText(html);
    const summary = description || firstSentences(articleText, 2);
    const content = [title, summary, sourceUrl].filter(Boolean).join("\n\n");
    const imageUrl = extractOpenGraphImageFromHtml(html, sourceUrl);

    if (!title && !summary) {
      return NextResponse.json({ error: "Could not extract text from that URL." }, { status: 422 });
    }

    const sourceEvidenceSnapshot = buildUrlEvidenceSnapshot({
      url: sourceUrl,
      title,
      summary,
      imageUrl,
    });
    const sourceEvidence = await sourceEvidenceStore.upsertEvidence({
      workspaceId: tenant.currentWorkspace.id,
      candidate: normalizeUrlEvidenceCandidate({
        url: sourceUrl,
        title,
        summary,
        imageUrl,
      }),
      metadata: {
        source: "post_generation_url",
      },
    });

    return NextResponse.json({
      source: "url",
      sourceUrl,
      title,
      summary,
      content,
      imageUrl,
      sourceEvidenceId: sourceEvidence.id,
      sourceEvidenceSnapshot,
    });
  } catch (error) {
    console.error("[post-generation:url] failed:", error);
    return NextResponse.json({ error: "Could not generate a post from that URL." }, { status: 500 });
  }
}

async function fetchReadablePage(url: string, redirectsRemaining = 4): Promise<Response | null> {
  if (!(await isSafeRemoteHttpUrl(url))) return null;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(12000),
    redirect: "manual",
  }).catch(() => null);

  if (!response) return null;
  if (response.status >= 300 && response.status < 400) {
    if (redirectsRemaining <= 0) return null;
    const location = response.headers.get("location");
    if (!location) return null;
    const nextUrl = new URL(location, url).toString();
    if (!parseHttpUrl(nextUrl)) return null;
    return fetchReadablePage(nextUrl, redirectsRemaining - 1);
  }

  return response;
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractTitle(html: string) {
  return cleanRichText(
    metaContent(html, "property", "og:title") ||
      metaContent(html, "name", "twitter:title") ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      ""
  ).slice(0, 180);
}

function extractDescription(html: string) {
  return cleanRichText(
    metaContent(html, "name", "description") ||
      metaContent(html, "property", "og:description") ||
      metaContent(html, "name", "twitter:description") ||
      ""
  ).slice(0, 500);
}

function metaContent(html: string, attr: "property" | "name", value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
  }

  return "";
}

function extractArticleText(html: string) {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const source = articleMatch?.[1] || html;
  return cleanRichText(source).slice(0, 1200);
}

function firstSentences(value: string, count: number) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(" ")
    .slice(0, 500);
}
