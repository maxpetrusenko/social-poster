import { buildSiteJsonLd } from "@/lib/site/brand-json-ld";

/**
 * Renders the sitewide JSON-LD graph for the current request host.
 *
 * Rendered once from the root layout so every page inherits it. The App Router
 * owns `<head>` through the metadata API, so the script is rendered at the top
 * of `<body>`; Google reads JSON-LD from anywhere in the document.
 *
 * `dangerouslySetInnerHTML` is the documented way to emit JSON-LD in the App
 * Router: React would otherwise escape the quotes and the block would stop being
 * valid JSON. The serialized value is built from static strings in
 * `src/lib/site/brand-json-ld.ts` (host names and fixed schema values), so it
 * cannot contain markup that closes the tag.
 */
export function SiteJsonLd({ host }: { host?: string | null }) {
  const graph = buildSiteJsonLd(host);

  if (!graph) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
