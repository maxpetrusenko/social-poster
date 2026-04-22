import { readCampaignMedia } from "@/lib/campaigns/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const media = await readCampaignMedia(filename);
  if (!media) return new Response("Not found", { status: 404 });

  return new Response(media.bytes, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Length": String(media.bytes.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
