import { getScreenshotPath } from "@/lib/screenshot";
import { existsSync, readFileSync, statSync } from "node:fs";
import { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!/^[\w-]+\.png$/.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = getScreenshotPath(filename);

  if (!existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const stat = statSync(filePath);
  const buffer = readFileSync(filePath);

  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
