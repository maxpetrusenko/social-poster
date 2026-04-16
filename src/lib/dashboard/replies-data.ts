import { db } from "@/db";
import { platforms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { listReplyCandidates } from "@/lib/replies/live";
import {
  DEFAULT_REPLY_PROFILE_ID,
  getReplyProfiles,
  type ReplyProfileId,
} from "@/lib/replies/profiles";
import type { ReplyLanguage } from "@/lib/replies/language";
import { resolveReplyTransport, type ReplyTransport } from "@/lib/replies/transport";

export type ReplyConnectionOption = {
  id: string;
  label: string;
  handle: string | null;
  provider: string;
  authMethod: string | null;
  transportOptions: Array<{
    value: ReplyTransport;
    label: string;
  }>;
};

export type ReplyProfileOption = {
  id: ReplyProfileId;
  label: string;
  summary: string;
  directionsLabel: string;
  destination: string;
};

export const DEFAULT_REPLY_LANGUAGE: ReplyLanguage = "en";

export async function getRepliesPageData(workspaceId: string) {
  const rows = await db
    .select()
    .from(platforms)
    .where(eq(platforms.workspaceId, workspaceId));
  const xRows = rows.filter((platform) => ["twitter", "x"].includes(platform.type));

  const connections: ReplyConnectionOption[] = xRows.flatMap((platform) => {
    try {
      const stored = readStoredConnectionConfig(platform.config);
      const meta = getPlatformMeta("twitter");
      const transport = resolveReplyTransport(platform);

      return [
        {
          id: platform.id,
          label: platform.name || platform.handle || `${meta.label} connection`,
          handle: platform.handle,
          provider: platform.provider,
          authMethod: stored.authMethod ?? null,
          transportOptions: [
            {
              value: transport,
              label: transport === "bird" ? "Bird" : "X API",
            },
          ],
        },
      ];
    } catch {
      return [];
    }
  });

  const profiles: ReplyProfileOption[] = getReplyProfiles().map((profile) => ({
    id: profile.id,
    label: profile.label,
    summary: profile.summary,
    directionsLabel: profile.directions.join(" / "),
    destination: profile.destination,
  }));

  const initialPlatformId = connections[0]?.id;
  const candidates = initialPlatformId
    ? await listReplyCandidates(
        initialPlatformId,
        DEFAULT_REPLY_PROFILE_ID,
        workspaceId,
        DEFAULT_REPLY_LANGUAGE
      )
    : [];

  return {
    connections,
    profiles,
    candidates,
    defaultLanguage: DEFAULT_REPLY_LANGUAGE,
  };
}
