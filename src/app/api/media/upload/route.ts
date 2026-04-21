import { NextRequest, NextResponse } from "next/server";

import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { uploadMediaAsset } from "@/lib/storage/r2";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a media file." }, { status: 400 });
    }

    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WEBP, GIF, MP4, MOV, or WEBM file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_MEDIA_BYTES) {
      return NextResponse.json(
        { error: "Media must be 25 MB or smaller." },
        { status: 413 }
      );
    }

    const stored = await uploadMediaAsset({
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      keyPrefix: `workspaces/${tenant.currentWorkspace.id}/posts/media`,
      sourceName: file.name,
    });

    if (!stored) {
      return NextResponse.json(
        { error: "Media upload storage is not configured." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      url: stored.url,
      key: stored.key,
      contentType: file.type,
      size: file.size,
    });
  } catch (error) {
    console.error("Media upload failed:", error);
    return NextResponse.json({ error: "Media upload failed." }, { status: 500 });
  }
}
