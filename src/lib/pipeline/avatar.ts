import https from "node:https";

const SIMLI_URL = "https://api.simli.ai/static/audio";

function httpGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export async function generateAvatar(audioBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) throw new Error("SIMLI_API_KEY not set");

  const faceId = process.env.SIMLI_FACE_ID || "7bb46589-4be6-4df8-ab80-03443fb75d6f";
  console.log(`[avatar] generating from ${audioBuffer.length} byte audio`);

  const res = await fetch(SIMLI_URL, {
    method: "POST",
    headers: {
      "x-simli-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      faceId,
      audioBase64: audioBuffer.toString("base64"),
      audioFormat: "wav",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Simli ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { mp4_url: string; mp4_availablility_eta_seconds: number };
  const waitMs = (data.mp4_availablility_eta_seconds + 5) * 1000;
  console.log(`[avatar] waiting ${Math.round(waitMs / 1000)}s for render`);
  await new Promise((r) => setTimeout(r, waitMs));

  console.log(`[avatar] downloading ${data.mp4_url}`);
  const mp4 = await httpGet(data.mp4_url);
  console.log(`[avatar] ${mp4.length} bytes`);
  return mp4;
}
