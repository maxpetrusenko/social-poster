import { NextRequest, NextResponse } from "next/server";
import {
  isBlogPublishAuthorized,
  publishExternalBlogArticle,
} from "@/lib/blog/external-publish";

export async function POST(request: NextRequest) {
  const token = process.env.BLOG_PUBLISH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Blog publishing is not configured." }, { status: 503 });
  }
  if (!isBlogPublishAuthorized(request.headers.get("authorization"), token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await publishExternalBlogArticle(await request.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blog publication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
