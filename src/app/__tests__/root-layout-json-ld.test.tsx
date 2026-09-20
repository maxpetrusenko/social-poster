import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Proves the sitewide JSON-LD graph is resolved per request host.
 *
 * This renders the REAL root layout (`src/app/layout.tsx`) through React's
 * server renderer with only `next/headers` swapped for a mutable host, then
 * parses the `<script type="application/ld+json">` block out of the markup as
 * JSON — the same thing a crawler does. It does not grep the graph's source: a
 * hardcoded brand would still pass a grep of the code and must fail here.
 *
 * The negative-control case is the point of the file. The three public brands
 * share one deployment, so the realistic regression is somebody hardcoding one
 * brand (or reusing one `@id` origin) and every host then claiming to be
 * clawposter.app. `every host only ever describes itself` fails loudly on that.
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

type Brand = {
  host: string;
  name: string;
  /** Every other brand on this deployment — none of these may appear. */
  rivals: { host: string; name: string }[];
};

const BRANDS: Brand[] = [
  {
    host: "clawposter.app",
    name: "ClawPoster",
    rivals: [
      { host: "smmclaw.app", name: "SMMClaw" },
      { host: "smmagent.app", name: "SMM Agent" },
    ],
  },
  {
    host: "smmclaw.app",
    name: "SMMClaw",
    rivals: [
      { host: "clawposter.app", name: "ClawPoster" },
      { host: "smmagent.app", name: "SMM Agent" },
    ],
  },
  {
    host: "smmagent.app",
    name: "SMM Agent",
    rivals: [
      { host: "clawposter.app", name: "ClawPoster" },
      { host: "smmclaw.app", name: "SMMClaw" },
    ],
  },
];

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

  it.each(BRANDS)(
    "gives $host its own brand identity in every node",
    async (brand) => {
      const graph = await renderedGraph(brand.host);
      const origin = `https://${brand.host}`;

      const organization = nodeOfType(graph, "Organization");
      expect(organization["@id"]).toBe(`${origin}/#organization`);
      expect(organization.name).toBe(brand.name);
      expect(organization.url).toBe(`${origin}/`);
      expect(organization.logo).toMatchObject({
        "@type": "ImageObject",
        url: `${origin}/logo-256.png`,
      });

      const website = nodeOfType(graph, "WebSite");
      expect(website["@id"]).toBe(`${origin}/#website`);
      expect(website.name).toBe(brand.name);
      expect(website.url).toBe(`${origin}/`);

      const software = nodeOfType(graph, "SoftwareApplication");
      expect(software["@id"]).toBe(`${origin}/#software`);
      expect(software.name).toBe(brand.name);
      expect(software.url).toBe(`${origin}/`);
      expect(software.applicationCategory).toBe("SocialNetworkingApplication");
      expect(software.operatingSystem).toBe("Web");
    }
  );

  it.each(BRANDS)(
    "resolves every @id cross-reference inside $host's own graph",
    async (brand) => {
      const graph = await renderedGraph(brand.host);
      const nodes = graphNodes(graph);

      const ids = nodes.map((node) => node["@id"]);
      expect(new Set(ids).size, "duplicate @id values in one graph").toBe(ids.length);

      const organizationId = nodeOfType(graph, "Organization")["@id"];
      expect(organizationId).toBe(`https://${brand.host}/#organization`);
      for (const type of ["WebSite", "SoftwareApplication"]) {
        expect(nodeOfType(graph, type).publisher).toEqual({ "@id": organizationId });
      }

      // Every absolute URL in the graph belongs to the host that rendered it
      // (the schema.org @context is the vocabulary, not a claimed URL).
      const urls = (JSON.stringify(graph).match(/https?:\/\/[^"\\]+/g) ?? []).filter(
        (url) => url !== "https://schema.org" && url !== "http://schema.org"
      );
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url, `${brand.host} graph contains a foreign URL: ${url}`).toContain(
          `https://${brand.host}/`
        );
      }
    }
  );

  // NEGATIVE CONTROL. A refactor that hardcodes one brand, or reuses one origin
  // for the @ids, must fail here.
  it.each(BRANDS.map((brand) => [brand.host, brand.name, brand.rivals] as const))(
    "never emits another brand's name or host on %s",
    async (host, name, rivals) => {
      const graph = await renderedGraph(host);
      expect(graphNodes(graph)[0].name).toBe(name);

      const serialized = JSON.stringify(graph);
      for (const rival of rivals) {
        expect(serialized).not.toContain(rival.host);
        expect(serialized).not.toContain(rival.name);
      }
    }
  );

  it("pins the smmagent.app regression: smmclaw.app must not describe SMM Agent", async () => {
    const graph = await renderedGraph("smmclaw.app");
    const serialized = JSON.stringify(graph);

    expect(serialized).toContain("SMMClaw");
    expect(serialized).not.toContain("smmagent.app");
    expect(serialized).not.toContain("SMM Agent");
  });

  it("resolves a www host to its canonical brand identity", () => {
    const html = renderToStaticMarkup(<SiteJsonLd host="www.smmclaw.app" />);
    const blocks = jsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    const graph = blocks[0];

    expect(graph["@id"]).toBeUndefined();
    const organization = nodeOfType(graph, "Organization");
    expect(organization.name).toBe("SMMClaw");
    expect(organization.url).toBe("https://smmclaw.app/");
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
