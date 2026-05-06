import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/open-graph-image", () => ({
  fetchOpenGraphImage: vi.fn(),
}));
vi.mock("@/lib/safe-remote-fetch", () => ({
  safeFetchRemote: vi.fn(),
}));

import { fetchOpenGraphImage } from "@/lib/open-graph-image";
import { safeFetchRemote } from "@/lib/safe-remote-fetch";
import {
  resolveStoryImageUrl,
  resolveVerifiedOpenGraphImage,
  verifySourceImageUrl,
} from "../pipeline/feed-engine.ts";

function imageResponse(contentType = "image/jpeg") {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async text() {
      return "";
    },
    async arrayBuffer() {
      return new ArrayBuffer(0);
    },
  };
}

beforeEach(() => {
  vi.mocked(fetchOpenGraphImage).mockReset();
  vi.mocked(safeFetchRemote).mockReset();
});

test("resolveVerifiedOpenGraphImage returns a verified OG image", async () => {
  vi.mocked(fetchOpenGraphImage).mockResolvedValue("https://cdn.example.com/og.jpg");
  vi.mocked(safeFetchRemote).mockResolvedValue(imageResponse());

  await expect(resolveVerifiedOpenGraphImage("https://source.example.com/post"))
    .resolves.toBe("https://cdn.example.com/og.jpg");
});

test("resolveStoryImageUrl prefers verified OG over feed image", async () => {
  vi.mocked(fetchOpenGraphImage).mockResolvedValue("https://cdn.example.com/og.jpg");
  vi.mocked(safeFetchRemote).mockImplementation(async (url) =>
    String(url).includes("cdn.example.com") ? imageResponse() : null
  );

  await expect(
    resolveStoryImageUrl(
      {
        title: "Story",
        summary: "Useful source summary with enough detail to be usable.",
        link: "https://source.example.com/post",
        score: 10,
        imageUrl: "https://feed.example.com/card.jpg",
      },
      "prefer_open_graph"
    )
  ).resolves.toBe("https://cdn.example.com/og.jpg");
});

test("resolveStoryImageUrl falls back to verified feed image when OG is missing", async () => {
  vi.mocked(fetchOpenGraphImage).mockResolvedValue(null);
  vi.mocked(safeFetchRemote).mockResolvedValue(imageResponse());

  await expect(
    resolveStoryImageUrl(
      {
        title: "Story",
        summary: "Useful source summary with enough detail to be usable.",
        link: "https://source.example.com/post",
        score: 10,
        imageUrl: "https://feed.example.com/card.jpg",
      },
      "prefer_open_graph"
    )
  ).resolves.toBe("https://feed.example.com/card.jpg");
});

test("verifySourceImageUrl rejects localhost and private-fetch failures", async () => {
  vi.mocked(safeFetchRemote).mockResolvedValue(null);

  await expect(verifySourceImageUrl("http://localhost:3000/card.jpg")).resolves.toBeNull();
  await expect(verifySourceImageUrl("http://127.0.0.1/card.jpg")).resolves.toBeNull();
});

test("verifySourceImageUrl rejects tiny, placeholder, and non-image URLs", async () => {
  vi.mocked(safeFetchRemote).mockResolvedValue(imageResponse("text/html"));

  await expect(verifySourceImageUrl("https://cdn.example.com/pixel.gif?w=1")).resolves.toBeNull();
  await expect(
    verifySourceImageUrl("https://cdn.example.com/placeholder-120x80.jpg")
  ).resolves.toBeNull();
  await expect(verifySourceImageUrl("https://cdn.example.com/card.jpg")).resolves.toBeNull();
  expect(vi.mocked(safeFetchRemote)).toHaveBeenCalledTimes(1);
});
