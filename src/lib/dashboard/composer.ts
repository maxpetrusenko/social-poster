import { getPlatformCapabilities } from "@/lib/platform-capabilities";

type PlatformRow = {
  id: string;
  name: string;
  handle: string | null;
  type: string;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
};

export type ComposerProfile = {
  id: string;
  name: string;
};

export type ComposerPlatform = {
  id: string;
  name: string;
  handle: string | null;
  type: string;
  provider: string;
  enabled: boolean;
  capabilities: ReturnType<typeof getPlatformCapabilities>;
};

export type ComposerInitialValues = {
  title?: string;
  content?: string;
  contentType?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  scheduledAt?: string;
  profileId?: string;
  platformIds?: string[];
};

export function mapComposerPlatforms(platformRows: PlatformRow[]): ComposerPlatform[] {
  return platformRows.map((platform) => ({
    id: platform.id,
    name: platform.name,
    handle: platform.handle,
    type: platform.type,
    provider: platform.provider,
    enabled: platform.enabled,
    capabilities: getPlatformCapabilities(platform),
  }));
}
