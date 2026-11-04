import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceEditor: vi.fn().mockResolvedValue({
    currentWorkspace: { id: "workspace-1" },
    user: { id: "user-1" },
  }),
}));
const uploadMediaAsset = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ url: "https://cdn.test/a.mp4", key: "a.mp4" })
);
vi.mock("@/lib/storage/r2", () => ({ uploadMediaAsset }));

import nextConfig from "../../../next.config";
import { MAX_MEDIA_BYTES, MAX_MEDIA_MB } from "@/lib/media-limits";
import { POST } from "@/app/api/media/upload/route";

function uploadRequest(file: File) {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest("http://localhost/api/media/upload", { method: "POST", body: form });
}

describe("media size limit", () => {
  it("raises the middleware body limit to the shared media cap (default 10 MB truncates uploads)", () => {
    expect(MAX_MEDIA_BYTES).toBeGreaterThan(25 * 1024 * 1024);
    expect(nextConfig.experimental?.middlewareClientMaxBodySize).toBe(MAX_MEDIA_BYTES);
  });

  it("accepts a video larger than the old 25 MB cap", async () => {
    const file = new File([new Uint8Array(26 * 1024 * 1024)], "big.mp4", { type: "video/mp4" });
    const response = await POST(uploadRequest(file));
    expect(response.status).toBe(200);
    expect(uploadMediaAsset).toHaveBeenCalled();
  });

  it("rejects media over the cap with a 413 naming the cap", async () => {
    uploadMediaAsset.mockClear();
    const file = new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], "huge.mp4", { type: "video/mp4" });
    const response = (await POST(uploadRequest(file))) as NextResponse;
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe(`Media must be ${MAX_MEDIA_MB} MB or smaller.`);
    expect(uploadMediaAsset).not.toHaveBeenCalled();
  });
});
