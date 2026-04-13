import { platforms } from "@/db/schema";
import {
  getCapabilityFailureReason,
  getPlatformCapabilities,
  type PublishMediaKind,
} from "@/lib/platform-capabilities";
import { publishToBird } from "./bird-publisher";
import { publishToLate, type PublishResult } from "./publisher";

type PlatformRow = typeof platforms.$inferSelect;

export type PublishPlatformInput = {
  platform: PlatformRow;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  instagramContentType?: "reel" | "story";
};

export type PublishExecutionSummary = {
  outcomes: PublishResult[];
  published: string[];
  errors: Array<{
    platform: string;
    error: string;
    classification: PublishResult["classification"];
  }>;
};

function shouldPublishViaBird(platform: Pick<PlatformRow, "provider" | "type">) {
  return (
    platform.provider === "bird" &&
    ["twitter", "x"].includes(platform.type.toLowerCase())
  );
}

function resolveRequestedMediaKind(
  target: Pick<PublishPlatformInput, "mediaUrl" | "mediaType">
): PublishMediaKind {
  if (target.mediaType === "video") {
    return "video";
  }

  if (target.mediaUrl) {
    return "image";
  }

  return "text";
}

function createValidationFailure(
  target: PublishPlatformInput,
  message: string
): PublishResult {
  return {
    platform: target.platform.type,
    provider: target.platform.provider === "bird" ? "bird" : "late",
    accountId: target.platform.accountId,
    success: false,
    classification: "validation_error",
    error: message,
  };
}

export async function publishPlatformTargets(
  targets: PublishPlatformInput[]
): Promise<PublishExecutionSummary> {
  const outcomes: PublishResult[] = [];

  for (const target of targets) {
    if (!target.platform.enabled) {
      outcomes.push(
        createValidationFailure(target, "Target platform is disabled.")
      );
      continue;
    }

    const requestedMediaKind = resolveRequestedMediaKind(target);
    const capabilities = getPlatformCapabilities(target.platform);
    const capabilityFailure = getCapabilityFailureReason(
      capabilities,
      requestedMediaKind
    );

    if (capabilityFailure) {
      outcomes.push(createValidationFailure(target, capabilityFailure));
      continue;
    }

    const outcome = shouldPublishViaBird(target.platform)
      ? await publishToBird({
          platform: target.platform,
          content: target.content,
          mediaUrl: target.mediaUrl,
        })
      : (
          await publishToLate([
            {
              platform: target.platform.type,
              accountId: target.platform.accountId,
              content: target.content,
              mediaUrl: target.mediaUrl,
              mediaType: target.mediaType,
              instagramContentType: target.instagramContentType,
            },
          ])
        )[0];

    outcomes.push(outcome);
  }

  return {
    outcomes,
    published: outcomes
      .filter((outcome) => outcome.success)
      .map((outcome) => outcome.platform),
    errors: outcomes
      .filter((outcome) => !outcome.success)
      .map((outcome) => ({
        platform: outcome.platform,
        error: outcome.error ?? "Unknown error",
        classification: outcome.classification,
      })),
  };
}
