import { db } from "@/db";
import { platforms } from "@/db/schema";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { listReplyCandidates } from "@/lib/replies/live";
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

export async function getRepliesPageData() {
  const rows = await db.select().from(platforms);
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

  const initialPlatformId = connections[0]?.id;
  const candidates = initialPlatformId ? await listReplyCandidates(initialPlatformId) : [];

  return { connections, candidates };
}
