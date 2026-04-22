import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { SMM_AGENT_ORIGIN } from "@/lib/site-domains";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} bg-[var(--sand)] text-[var(--ink)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
