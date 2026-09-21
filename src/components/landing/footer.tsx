import Link from "next/link";
import { headers } from "next/headers";
import {
  getPublicSiteBrandName,
  getPublicSiteKey,
  isPublicMarketingHost,
  normalizeHost,
  type PublicSiteKey,
} from "@/lib/site-domains";

type RelatedTool = {
  siteKey: PublicSiteKey;
  label: string;
  href: string;
};

// Sibling SMM brands only, topically related to this deployment. Small, visible,
// and host-filtered through `getPublicSiteKey` — the same helper `sitemap.ts`,
// `robots.ts` and `brand-json-ld.ts` share — so a host can only ever link to the
// other two brands, never to itself.
export const RELATED_TOOLS: readonly RelatedTool[] = [
  { siteKey: "smmagent", label: "SMM Agent", href: "https://smmagent.app" },
  { siteKey: "smmclaw", label: "SMMClaw", href: "https://smmclaw.app" },
  { siteKey: "clawposter", label: "ClawPoster", href: "https://clawposter.app" },
];

const networkLinks = [
  { label: "Dashboard", href: "https://smmagent.app/dashboard" },
];

async function getRequestHost() {
  const requestHeaders = await headers();
  return normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  );
}

export async function LandingFooter({
  brandName,
  currentHost,
}: {
  brandName?: string;
  currentHost?: string | null;
}) {
  const host = currentHost === undefined ? await getRequestHost() : normalizeHost(currentHost);
  const resolvedBrandName = brandName ?? getPublicSiteBrandName(host);

  // Hosts outside the three public marketing brands (legacy host, localhost, a
  // custom domain) get no cross-links: guessing an identity for them is the
  // failure mode `brand-json-ld.ts` already refuses.
  const siteKey = getPublicSiteKey(host);
  const relatedTools = isPublicMarketingHost(host)
    ? RELATED_TOOLS.filter((tool) => tool.siteKey !== siteKey)
    : [];

  return (
    <footer className="border-t border-[var(--line)] py-12 px-6">
      <div className="container flex flex-col items-center justify-between gap-6 text-sm text-[var(--muted)] md:flex-row">
        <div className="font-semibold text-[var(--ink)] font-[family-name:var(--font-serif)] text-lg">
          {resolvedBrandName}
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link href="/blog" className="hover:text-[var(--ink)] transition-colors">Blog</Link>
          <Link href="/privacy" className="hover:text-[var(--ink)] transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--ink)] transition-colors">Terms of Service</Link>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {networkLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-[var(--ink)] transition-colors">
              {link.label}
            </a>
          ))}
        </div>
      </div>
      {relatedTools.length > 0 ? (
        <div className="container mt-8 border-t border-[var(--line)] pt-6">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Related tools
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-[var(--muted)] md:justify-start">
            {relatedTools.map((tool) => (
              <li key={tool.href}>
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noopener"
                  className="hover:text-[var(--ink)] transition-colors"
                >
                  {tool.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="container mt-8 text-center text-xs text-[var(--muted)] md:text-left">
        &copy; {new Date().getFullYear()} {resolvedBrandName}
      </div>
    </footer>
  );
}
