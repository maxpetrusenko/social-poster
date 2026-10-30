import Link from "next/link";
import { headers } from "next/headers";
import {
  getPublicSiteBrandName,
  normalizeHost,
} from "@/lib/site-domains";

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
      <div className="container mt-8 text-center text-xs text-[var(--muted)] md:text-left">
        &copy; {new Date().getFullYear()} {resolvedBrandName}
      </div>
    </footer>
  );
}
