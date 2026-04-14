import { platforms } from "@/db/schema";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import { sendBirdReply } from "@/lib/replies/bird";
import { sendXApiReply } from "@/lib/replies/x-api";

type PlatformRow = typeof platforms.$inferSelect;

export type ReplyTransport = "bird" | "x_api";

export function resolveReplyTransport(
  platform: Pick<PlatformRow, "provider" | "config">
): ReplyTransport {
  const stored = readStoredConnectionConfig(platform.config);
  const authMethod = stored.authMethod?.toLowerCase();

  if (platform.provider === "bird" || authMethod === "bird_cli") {
    return "bird";
  }

  if (authMethod === "x_api") {
    return "x_api";
  }

  if (platform.provider === "direct") {
    return "x_api";
  }

  throw new Error("Unsupported X reply transport for selected connection");
}

export async function sendReplyViaPlatform(
  platform: Pick<PlatformRow, "provider" | "config" | "handle">,
  tweetUrl: string,
  text: string
) {
  const transport = resolveReplyTransport(platform);

  if (transport === "bird") {
    const replyUrl = await sendBirdReply(tweetUrl, text);
    if (!replyUrl) {
      throw new Error("Bird reply sent but no URL returned");
    }
    return { replyUrl, transport };
  }

  const replyUrl = await sendXApiReply(platform, tweetUrl, text);
  return { replyUrl, transport };
}
