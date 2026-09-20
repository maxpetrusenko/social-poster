import type { Metadata } from "next";
import { headers } from "next/headers";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { LandingFooter } from "@/components/landing/footer";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import { normalizeHost, SMM_AGENT_ORIGIN } from "@/lib/site-domains";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SMM_AGENT_ORIGIN),
  applicationName: "SMM Agent",
  title: {
    default: "SMM Agent",
    template: "%s | SMM Agent",
  },
  description:
    "SMM Agent helps teams create, schedule, publish, and monitor social content from one dashboard.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/logo-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-64.png", sizes: "64x64", type: "image/png" },
      { url: "/logo-256.png", sizes: "256x256", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/logo-256.png", sizes: "256x256", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: SMM_AGENT_ORIGIN,
    title: "SMM Agent",
    description:
      "Create, schedule, publish, and monitor social content from one workspace.",
    siteName: "SMM Agent",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SMM Agent dashboard preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SMM Agent",
    description:
      "Create, schedule, publish, and monitor social content from one workspace.",
    images: ["/opengraph-image"],
  },
};

/**
 * Hosts are resolved per request because this one deployment serves three
 * separate public brands. The sitewide JSON-LD graph (`SiteJsonLd`) is emitted
 * here, once, so every page on every host inherits the same Organization /
 * WebSite / SoftwareApplication nodes for the brand that actually owns the
 * request. `LandingFooter` below already reads `headers()`, so resolving the host
 * here does not make any route dynamic that was not dynamic before.
 */
async function getRequestHost() {
  const requestHeaders = await headers();
  return normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = await getRequestHost();

  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} bg-[var(--sand)] text-[var(--ink)] antialiased`}>
        <SiteJsonLd host={host} />
        {children}
        <LandingFooter />
      </body>
    </html>
  );
}
