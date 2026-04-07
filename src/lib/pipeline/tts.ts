const CARTESIA_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_VERSION = "2024-06-10";

export async function generateTTS(text: string): Promise<Buffer> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error("CARTESIA_API_KEY not set");

  const voiceId = process.env.CARTESIA_VOICE_ID || "7270ea4d-a17a-4f21-a3da-03f2b128669d";
  console.log(`[tts] generating ${text.length} chars`);

  const res = await fetch(CARTESIA_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-2",
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "wav", encoding: "pcm_f32le", sample_rate: 44100 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cartesia ${res.status}: ${body.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`[tts] ${buf.length} bytes`);
  return buf;
}
