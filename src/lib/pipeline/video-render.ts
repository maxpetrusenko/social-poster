import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface RenderOpts {
  headline: string;
  bullets: string[];
  audioPath: string;   // absolute path to WAV
  avatarPath: string;  // absolute path to MP4
  outputPath?: string;
}

export async function renderVideo(opts: RenderOpts): Promise<Buffer> {
  const remotionDir = join(process.cwd(), "src", "remotion");
  const publicDir = join(process.cwd(), "public");
  mkdirSync(publicDir, { recursive: true });

  // Copy media to remotion/public/
  const audioName = "narration.wav";
  const avatarName = "avatar.mp4";
  copyFileSync(opts.audioPath, join(publicDir, audioName));
  copyFileSync(opts.avatarPath, join(publicDir, avatarName));

  // Get audio duration via ffprobe
  let durationSec = 20;
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${opts.audioPath}"`,
      { encoding: "utf-8" }
    );
    durationSec = Math.min(60, Math.max(8, Math.ceil(parseFloat(out.trim())) + 2));
  } catch {
    console.warn("[render] ffprobe failed, using 20s default");
  }

  const props = {
    headline: opts.headline,
    bullets: opts.bullets.length > 0 ? opts.bullets : ["Key insight", "Why it matters", "What's next"],
    audioUrl: audioName,
    avatarVideoUrl: avatarName,
    durationInSeconds: durationSec,
  };

  const propsFile = join("/tmp", `props-${Date.now()}.json`);
  const outputFile = opts.outputPath || join("/tmp", `video-${Date.now()}.mp4`);
  writeFileSync(propsFile, JSON.stringify(props));

  console.log(`[render] ${opts.headline} (${durationSec}s)`);

  try {
    execSync(
      `npx remotion render ${join(remotionDir, "Root.tsx")} AiNewsVideo --output="${outputFile}" --props="${propsFile}" --codec h264 --crf 18`,
      { cwd: process.cwd(), stdio: "pipe", timeout: 300000 }
    );
    const buf = readFileSync(outputFile);
    console.log(`[render] ${buf.length} bytes`);
    return buf;
  } finally {
    try { unlinkSync(propsFile); } catch {}
    try { unlinkSync(outputFile); } catch {}
    try { unlinkSync(join(publicDir, audioName)); } catch {}
    try { unlinkSync(join(publicDir, avatarName)); } catch {}
  }
}
