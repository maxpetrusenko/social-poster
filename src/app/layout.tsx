import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { PRODUCT_ORIGIN } from "@/lib/site-domains";
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
  metadataBase: new URL(PRODUCT_ORIGIN),
  title: "ClawPoster — AI Social Posting Agent",
  description: "Your AI agent for social posting. Writes your posts, adapts per platform, and publishes while you build.",
  openGraph: {
    title: "ClawPoster — AI Social Posting Agent",
    description: "Your AI agent for social posting. Writes, adapts, and publishes while you build.",
    siteName: "ClawPoster",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClawPoster — AI Social Posting Agent",
    description: "Your AI agent for social posting. Writes, adapts, and publishes while you build.",
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
