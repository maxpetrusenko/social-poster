import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractYouTubeTranscript,
  extractYouTubeVideoId,
  isYouTubeUrl,
} from "@/lib/article-agent/youtube-transcript";

vi.mock("server-only", () => ({}));

const originalRapidApiKey = process.env.RAPIDAPI_KEY;

afterEach(() => {
  if (originalRapidApiKey === undefined) {
    delete process.env.RAPIDAPI_KEY;
  } else {
    process.env.RAPIDAPI_KEY = originalRapidApiKey;
  }
  vi.restoreAllMocks();
});

describe("YouTube transcript extraction", () => {
  it("detects supported YouTube URLs and extracts video ids", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=SVTPv4sI_Jc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/SVTPv4sI_Jc")).toBe(true);
    expect(isYouTubeUrl("https://example.com/watch?v=SVTPv4sI_Jc")).toBe(false);
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=SVTPv4sI_Jc")).toBe("SVTPv4sI_Jc");
    expect(extractYouTubeVideoId("https://youtu.be/SVTPv4sI_Jc")).toBe("SVTPv4sI_Jc");
  });

  it("normalizes RapidAPI transcript segments into one artifact", async () => {
    process.env.RAPIDAPI_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            transcription: [
              { subtitle: "First segment." },
              { subtitle: { text: "Second segment." } },
              { text: ["Third", "segment."] },
            ],
          },
        ],
      }))
    );

    const result = await extractYouTubeTranscript("https://www.youtube.com/watch?v=SVTPv4sI_Jc");

    expect(result.videoId).toBe("SVTPv4sI_Jc");
    expect(result.transcript).toBe("First segment. Second segment. Third segment.");
    expect(result.wordCount).toBe(6);
    expect(fetch).toHaveBeenCalledWith(
      "https://youtube-transcriptor.p.rapidapi.com/transcript?video_id=SVTPv4sI_Jc",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-RapidAPI-Key": "test-key",
          "X-RapidAPI-Host": "youtube-transcriptor.p.rapidapi.com",
        }),
      })
    );
  });
});
