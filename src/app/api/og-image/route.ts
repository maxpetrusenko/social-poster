import { NextResponse } from "next/server";
import { decodeHtmlEntities } from "@/lib/pipeline/content-clean";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get("url");

  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(decodeHtmlEntities(sourceUrl));
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(remoteUrl.protocol)) {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  try {
    const response = await fetch(remoteUrl, {
      headers: {
        "User-Agent": "social-poster/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Image fetch failed" }, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Remote asset is not an image" }, { status: 415 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
  }
}
