import { describe, expect, it } from "vitest";

import {
  buildMediaAdjustmentPresets,
  computeCanvasPlacement,
  validateOriginalImageForPlatforms,
} from "@/lib/media-adjustment";

describe("media-adjustment", () => {
  it("builds a LinkedIn 1200x627 preset from selected platforms", () => {
    const presets = buildMediaAdjustmentPresets([
      { id: "linkedin", type: "linkedin" },
    ]);

    expect(presets).toContainEqual(
      expect.objectContaining({
        platformLabel: "LinkedIn",
        width: 1200,
        height: 627,
        aspect: "1.91:1",
      })
    );
  });

  it("builds presets for multiple selected platforms", () => {
    const presets = buildMediaAdjustmentPresets([
      { id: "linkedin", type: "linkedin" },
      { id: "instagram", type: "instagram", format: "Story" },
      { id: "x", type: "x" },
    ]);

    expect(presets.map((preset) => `${preset.width}x${preset.height}`)).toEqual(
      expect.arrayContaining(["1200x627", "1080x1920", "1200x675"])
    );
  });

  it("computes fill-crop placement that covers the target", () => {
    const placement = computeCanvasPlacement({
      sourceWidth: 1600,
      sourceHeight: 900,
      targetWidth: 1200,
      targetHeight: 627,
      mode: "fill",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });

    expect(placement.drawWidth).toBeGreaterThanOrEqual(1200);
    expect(placement.drawHeight).toBeGreaterThanOrEqual(627);
  });

  it("computes fit-pad placement inside the target", () => {
    const placement = computeCanvasPlacement({
      sourceWidth: 1600,
      sourceHeight: 900,
      targetWidth: 1200,
      targetHeight: 627,
      mode: "fit",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });

    expect(placement.drawWidth).toBeLessThanOrEqual(1200);
    expect(placement.drawHeight).toBeLessThanOrEqual(627);
  });

  it("passes original image when it matches platform requirements", () => {
    const result = validateOriginalImageForPlatforms({
      sourceWidth: 1200,
      sourceHeight: 627,
      sourceBytes: 500_000,
      platforms: [{ id: "linkedin", type: "linkedin" }],
    });

    expect(result.status).toBe("pass");
  });

  it("warns when original image aspect differs from platform recommendation", () => {
    const result = validateOriginalImageForPlatforms({
      sourceWidth: 1200,
      sourceHeight: 800,
      sourceBytes: 500_000,
      platforms: [{ id: "linkedin", type: "linkedin" }],
    });

    expect(result.status).toBe("warn");
    expect(result.messages[0]).toMatch(/aspect differs/);
  });

  it("fails original image when it is below platform minimum size", () => {
    const result = validateOriginalImageForPlatforms({
      sourceWidth: 300,
      sourceHeight: 157,
      sourceBytes: 500_000,
      platforms: [{ id: "linkedin", type: "linkedin" }],
    });

    expect(result.status).toBe("fail");
    expect(result.messages[0]).toMatch(/below/);
  });
});
