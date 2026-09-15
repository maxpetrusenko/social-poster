import Link from "next/link";
import { headers } from "next/headers";
import { getCanonicalHost, getPublicSiteBrandName, normalizeHost } from "@/lib/site-domains";

type OwnedProperty = {
  label: string;
  href: string;
  host: string;
};

// Max-owned properties. Every host listed here is rendered in the sitewide
// footer on every route; the host serving the current page is skipped so the
// block never links a page to itself.
export const OWNED_PROPERTIES: readonly OwnedProperty[] = [
  { label: "Max Petrusenko", href: "https://www.maxpetrusenko.com", host: "maxpetrusenko.com" },
  { label: "GeoAnalyzer", href: "https://geo-analyzer.com", host: "geo-analyzer.com" },
  { label: "Unfollow X", href: "https://unfollow-x.com", host: "unfollow-x.com" },
  { label: "SMM Agent", href: "https://smmagent.app", host: "smmagent.app" },
  { label: "SMMClaw", href: "https://smmclaw.app", host: "smmclaw.app" },
  { label: "ClawPoster", href: "https://clawposter.app", host: "clawposter.app" },
  { label: "Miami Contact Improv", href: "https://miamicontactimprov.com", host: "miamicontactimprov.com" },
  { label: "Max Wiki", href: "https://wiki.maxpetrusenko.com", host: "wiki.maxpetrusenko.com" },
];

const networkLinks = [
  { label: "Dashboard", href: "https://smmagent.app/dashboard" },
  { label: "Max Tech", href: "https://www.maxpetrusenko.com/tech" },
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
  const canonicalHost = getCanonicalHost(host);
  const resolvedBrandName = brandName ?? getPublicSiteBrandName(host);
  const visibleProperties = OWNED_PROPERTIES.filter(
    (property) => property.host !== canonicalHost
  );

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
      <nav
        aria-label="Max Petrusenko sites"
        className="container mt-8 border-t border-[var(--line)] pt-6"
      >
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-[var(--muted)] md:justify-start">
          {visibleProperties.map((property) => (
            <li key={property.href}>
              <a
                href={property.href}
                target="_blank"
                rel="noopener"
                className="hover:text-[var(--ink)] transition-colors"
              >
                {property.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="container mt-8 text-center text-xs text-[var(--muted)] md:text-left">
        &copy; {new Date().getFullYear()} {resolvedBrandName}
      </div>
    </footer>
  );
}
