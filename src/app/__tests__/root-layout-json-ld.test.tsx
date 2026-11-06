import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Proves the sitewide JSON-LD graph always describes SMM Agent on smmagent.app.
 *
 * This renders the REAL root layout (`src/app/layout.tsx`) through React's
 * server renderer with only `next/headers` swapped for a mutable host, then
 * parses the `<script type="application/ld+json">` block out of the markup as
 * JSON — the same thing a crawler does. It does not grep the graph's source: a
 * hardcoded brand would still pass a grep of the code and must fail here.
 */

const mocks = vi.hoisted(() => ({ host: "clawposter.app" }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": mocks.host }),
}));

// next/font/google compiles to build-time artifacts under `next build`; the
// layout only uses the returned CSS variable names.
vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "--font-sans", className: "font-sans" }),
  Cormorant_Garamond: () => ({ variable: "--font-serif", className: "font-serif" }),
}));

// The footer is an async server component that reads headers() itself; it
// carries no structured data, so it is stubbed the way `page.test.tsx` stubs it.
vi.mock("@/components/landing/footer", () => ({ LandingFooter: () => null }));

import RootLayout from "@/app/layout";
import { SiteJsonLd } from "@/components/seo/site-json-ld";

// One canonical brand. Retired hosts still resolve until the redirect is on and
// must describe SMM Agent on smmagent.app, never themselves.
const RETIRED_HOSTS = ["clawposter.app", "smmclaw.app", "www.clawposter.app", "www.smmclaw.app"];
const BRANDS = [{ host: "smmagent.app", name: "SMM Agent" }];
const CANONICAL_HOST = "smmagent.app";

type JsonLdNode = Record<string, unknown>;

function jsonLdBlocks(html: string): JsonLdNode[] {
  const blocks: string[] = [];
  const pattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks.map((block, index) => {
    try {
      return JSON.parse(block) as JsonLdNode;
    } catch (error) {
      throw new Error(`JSON-LD block ${index} did not parse as JSON: ${String(error)}`);
    }
  });
}

async function renderLayoutHtml(host: string) {
  mocks.host = host;
  const tree = await RootLayout({ children: null });
  return renderToStaticMarkup(tree);
}

/** The single graph object rendered for a host. */
async function renderedGraph(host: string) {
  const blocks = jsonLdBlocks(await renderLayoutHtml(host));
  expect(blocks, `${host} must render exactly one JSON-LD block`).toHaveLength(1);
  return blocks[0];
}

function graphNodes(graph: JsonLdNode): JsonLdNode[] {
  return (graph["@graph"] ?? []) as JsonLdNode[];
}

function nodeOfType(graph: JsonLdNode, type: string): JsonLdNode {
  const node = graphNodes(graph).find((candidate) => candidate["@type"] === type);
  expect(node, `${type} node missing from graph`).toBeDefined();
  return node as JsonLdNode;
}

afterEach(() => {
  mocks.host = "clawposter.app";
});

describe("sitewide JSON-LD graph, resolved per host", () => {
  it.each(BRANDS)(
    "emits exactly one well-formed Organization + WebSite + SoftwareApplication graph for $host",
    async (brand) => {
      const graph = await renderedGraph(brand.host);

      expect(graph["@context"]).toBe("https://schema.org");
      expect(graphNodes(graph).map((node) => node["@type"])).toEqual([
        "Organization",
        "WebSite",
        "SoftwareApplication",
      ]);
    }
  );

  it.each([...BRANDS.map((b) => b.host), ...RETIRED_HOSTS])(
    "describes SMM Agent on smmagent.app in every node when served from %s",
    async (host) => {
      const graph = await renderedGraph(host);
      const origin = `https://${CANONICAL_HOST}`;

      const organization = nodeOfType(graph, "Organization");
      expect(organization["@id"]).toBe(`${origin}/#organization`);
      expect(organization.name).toBe("SMM Agent");
      expect(organization.url).toBe(`${origin}/`);
      expect(organization.logo).toMatchObject({
        "@type": "ImageObject",
        url: `${origin}/logo-256.png`,
      });

      const website = nodeOfType(graph, "WebSite");
      expect(website["@id"]).toBe(`${origin}/#website`);
      expect(website.name).toBe("SMM Agent");
      expect(website.url).toBe(`${origin}/`);
      expect(website.publisher).toEqual({ "@id": organization["@id"] });

      const software = nodeOfType(graph, "SoftwareApplication");
      expect(software["@id"]).toBe(`${origin}/#software`);
      expect(software.name).toBe("SMM Agent");
      expect(software.url).toBe(`${origin}/`);
      expect(software.publisher).toEqual({ "@id": organization["@id"] });
      expect(software.applicationCategory).toBe("SocialNetworkingApplication");
      expect(software.operatingSystem).toBe("Web");
    }
  );

  it.each(RETIRED_HOSTS)("never mentions a retired brand or host on %s", async (host) => {
    const serialized = JSON.stringify(await renderedGraph(host));
    for (const retired of ["clawposter", "smmclaw", "ClawPoster", "SMMClaw"]) {
      expect(serialized).not.toContain(retired);
    }
    const urls = (serialized.match(/https?:\/\/[^"\\]+/g) ?? []).filter(
      (url) => url !== "https://schema.org"
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toContain("https://smmagent.app/");
  });

  it("resolves a www host to the canonical identity", () => {
    const html = renderToStaticMarkup(<SiteJsonLd host="www.smmclaw.app" />);
    const blocks = jsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    const organization = nodeOfType(blocks[0], "Organization");
    expect(organization.name).toBe("SMM Agent");
    expect(organization.url).toBe("https://smmagent.app/");
  });

  // The rest of the estate (legacy app host, custom domains, local dev) has no
  // brand of its own here; guessing one is the defect, not the fix.
  it.each(["social.maxpetrusenko.com", "localhost", "127.0.0.1:3000", "example.com", ""])(
    "emits no graph for non-public host %s",
    async (host) => {
      expect(jsonLdBlocks(await renderLayoutHtml(host))).toEqual([]);
    }
  );

  it.each(BRANDS)(
    "shows no self-serving review markup on $host",
    async (brand) => {
      const graph = await renderedGraph(brand.host);
      const serialized = JSON.stringify(graph);

      expect(serialized).not.toContain("AggregateRating");
      expect(serialized).not.toContain("Review");
      // No published price exists, so no price may be claimed.
      expect(nodeOfType(graph, "SoftwareApplication").offers).toBeUndefined();
      // No working search URL exists on any host.
      expect(nodeOfType(graph, "WebSite").potentialAction).toBeUndefined();
    }
  );
});
