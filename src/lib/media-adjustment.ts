import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { getImageDimensions, type ImageSpec } from "@/lib/platform-specs";

export type MediaFitMode = "fill" | "fit";

export type MediaAdjustmentPreset = ImageSpec & {
  key: string;
  platformLabel: string;
  platformType: string;
};

export type MediaAdjustmentPlatform = {
  id: string;
  type: string;
  format?: string | null;
};

export type CanvasPlacement = {
  dx: number;
  dy: number;
  drawWidth: number;
  drawHeight: number;
};

export type OriginalImageValidation = {
  status: "pass" | "warn" | "fail";
  messages: string[];
};

export function buildMediaAdjustmentPresets(
  platforms: MediaAdjustmentPlatform[]
): MediaAdjustmentPreset[] {
  const presets = new Map<string, MediaAdjustmentPreset>();

  for (const platform of platforms) {
    const platformLabel = getPlatformMeta(platform.type).label;
    for (const dim of getImageDimensions(platform.type, platform.format ?? undefined)) {
      const key = `${platform.type}:${platform.format ?? "default"}:${dim.width}x${dim.height}`;
      const existing = presets.get(key);
      if (existing) continue;
      presets.set(key, {
        ...dim,
        key,
        platformLabel,
        platformType: platform.type,
      });
    }
  }

  if (presets.size === 0) {
    presets.set("default:1200x627", {
      key: "default:1200x627",
      platformLabel: "Recommended",
      platformType: "default",
      label: "Post",
      width: 1200,
      height: 627,
      aspect: "1.91:1",
    });
  }

  return [...presets.values()];
}

export function validateOriginalImageForPlatforms(input: {
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes?: number | null;
  platforms: MediaAdjustmentPlatform[];
}): OriginalImageValidation {
  const messages: string[] = [];
  let status: OriginalImageValidation["status"] = "pass";

  for (const platform of input.platforms) {
    const platformLabel = getPlatformMeta(platform.type).label;
    const dimensions = getImageDimensions(platform.type, platform.format ?? undefined);
    let hasPassingPreset = false;
    let hasHardFailure = false;
    const platformMessages: string[] = [];

    for (const dim of dimensions) {
      const widthOk = !dim.minWidth || input.sourceWidth >= dim.minWidth;
      const heightOk = !dim.minHeight || input.sourceHeight >= dim.minHeight;
      const sizeOk =
        !dim.maxSizeMb ||
        !input.sourceBytes ||
        input.sourceBytes <= dim.maxSizeMb * 1024 * 1024;
      const ratioDelta = Math.abs(
        input.sourceWidth / input.sourceHeight - dim.width / dim.height
      );
      const ratioOk = ratioDelta <= 0.04;

      if (!widthOk || !heightOk) {
        hasHardFailure = true;
        platformMessages.push(
          `${platformLabel} ${dim.label}: original is below ${dim.minWidth ?? dim.width}x${dim.minHeight ?? dim.height}.`
        );
      } else if (!sizeOk) {
        hasHardFailure = true;
        platformMessages.push(`${platformLabel} ${dim.label}: original exceeds ${dim.maxSizeMb} MB.`);
      } else if (ratioOk) {
        hasPassingPreset = true;
      } else {
        platformMessages.push(`${platformLabel} ${dim.label}: aspect differs from ${dim.aspect}; platform may crop or pad it.`);
      }
    }

    if (hasPassingPreset) continue;
    if (hasHardFailure) {
      status = "fail";
      messages.push(...platformMessages);
    } else if (status !== "fail") {
      status = "warn";
      messages.push(platformMessages[0] ?? `${platformLabel}: aspect differs from recommended sizes; platform may crop or pad it.`);
    }
  }

  return {
    status,
    messages: messages.length > 0 ? messages : ["Original image fits selected platform requirements."],
  };
}

export function computeCanvasPlacement(input: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  mode: MediaFitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
}): CanvasPlacement {
  const baseScale =
    input.mode === "fill"
      ? Math.max(input.targetWidth / input.sourceWidth, input.targetHeight / input.sourceHeight)
      : Math.min(input.targetWidth / input.sourceWidth, input.targetHeight / input.sourceHeight);
  const scale = baseScale * input.zoom;
  const drawWidth = input.sourceWidth * scale;
  const drawHeight = input.sourceHeight * scale;
  const maxShiftX = Math.max(0, (drawWidth - input.targetWidth) / 2);
  const maxShiftY = Math.max(0, (drawHeight - input.targetHeight) / 2);

  return {
    dx: (input.targetWidth - drawWidth) / 2 + (input.offsetX / 100) * maxShiftX,
    dy: (input.targetHeight - drawHeight) / 2 + (input.offsetY / 100) * maxShiftY,
    drawWidth,
    drawHeight,
  };
}
