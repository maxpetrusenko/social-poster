import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readText(pathname: string) {
  return readFileSync(join(root, pathname), "utf8");
}

describe("SMM Agent branding assets", () => {
  it("ships a real favicon and web manifest for browser previews", () => {
    const favicon = readFileSync(join(root, "public/favicon.ico"));
    const manifest = JSON.parse(readText("public/site.webmanifest")) as {
      name: string;
      short_name: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    expect([...favicon.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(favicon.byteLength).toBeGreaterThan(1000);
    expect(manifest.name).toBe("SMM Agent");
    expect(manifest.short_name).toBe("SMM Agent");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/logo-256.png",
          sizes: "256x256",
          type: "image/png",
        }),
      ])
    );
  });

  it("keeps root metadata pointed at SMM Agent previews", () => {
    const layout = readText("src/app/layout.tsx");
    const home = readText("src/app/page.tsx");

    expect(layout).toContain('applicationName: "SMM Agent"');
    expect(layout).toContain('manifest: "/site.webmanifest"');
    expect(layout).toContain('{ url: "/favicon.ico" }');
    expect(layout).toContain('url: "/opengraph-image"');
    expect(layout).toContain('images: ["/opengraph-image"]');
    expect(home).toContain('title: "AI Social Media Agent for Operators — SMM Agent"');
    expect(home).toContain('siteName: "SMM Agent"');
    expect(home).toContain('getSmmAgentCanonicalUrl("/opengraph-image")');
    expect(home).not.toContain("Max Petrusenko Studio");
  });

  it("defines generated preview images with correct dimensions and copy", () => {
    const openGraphImage = readText("src/app/opengraph-image.tsx");
    const twitterImage = readText("src/app/twitter-image.tsx");

    expect(openGraphImage).toContain('export const alt = "SMM Agent dashboard preview"');
    expect(openGraphImage).toContain("width: 1200");
    expect(openGraphImage).toContain("height: 630");
    expect(openGraphImage).toContain('export const contentType = "image/png"');
    expect(openGraphImage).toContain("Plan, publish, and monitor every channel.");
    expect(openGraphImage).toContain("SMM Agent keeps posts, schedules, replies, approvals");
    expect(twitterImage).toContain('from "./opengraph-image"');
  });
});
