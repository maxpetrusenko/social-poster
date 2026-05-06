import "server-only";

const RAPIDAPI_HOST = "youtube-transcriptor.p.rapidapi.com";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

export type YouTubeTranscriptArtifact = {
  url: string;
  videoId: string;
  provider: "rapidapi-youtube-transcriptor";
  transcript: string;
  wordCount: number;
};

export function isYouTubeUrl(value: string) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i.test(value);
}

export function extractYouTubeVideoId(value: string) {
  const match = value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

export async function extractYouTubeTranscript(youtubeUrl: string): Promise<YouTubeTranscriptArtifact> {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) throw new Error("Invalid YouTube URL.");

  const keys = getRapidApiKeys();
  if (!keys.length) {
    throw new Error("YouTube transcript extraction needs RAPIDAPI_KEY_1, RAPIDAPI_KEY_2, RAPIDAPI_KEY_3, or RAPIDAPI_KEY configured.");
  }

  const endpoint = `${RAPIDAPI_BASE}/transcript?video_id=${encodeURIComponent(videoId)}`;
  let lastError: unknown = null;

  for (const apiKey of keys) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`RapidAPI transcript request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const transcript = parseRapidApiTranscript(data);
      if (!transcript) throw new Error("No transcript segments in RapidAPI response.");

      return {
        url: youtubeUrl,
        videoId,
        provider: "rapidapi-youtube-transcriptor",
        transcript,
        wordCount: transcript.split(/\s+/).filter(Boolean).length,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All RapidAPI transcript keys failed.");
}

function getRapidApiKeys() {
  return [
    process.env.RAPIDAPI_KEY_1,
    process.env.RAPIDAPI_KEY_2,
    process.env.RAPIDAPI_KEY_3,
    process.env.RAPIDAPI_KEY,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function parseRapidApiTranscript(data: unknown) {
  if (!Array.isArray(data) || !data.length) return "";
  const first = data[0] as { transcription?: Array<{ subtitle?: unknown; text?: unknown }> };
  if (!Array.isArray(first.transcription)) return "";
  return first.transcription
    .map((segment) => stringifyTranscriptSegment(segment.subtitle ?? segment.text))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringifyTranscriptSegment(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(stringifyTranscriptSegment).filter(Boolean).join(" ").trim();
  if (value && typeof value === "object") {
    const object = value as { text?: unknown; value?: unknown; subtitle?: unknown };
    return stringifyTranscriptSegment(object.text ?? object.value ?? object.subtitle);
  }
  return "";
}
