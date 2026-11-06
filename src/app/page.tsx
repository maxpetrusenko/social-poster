import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import {
  getSmmAgentCanonicalUrl,
  isPublicMarketingHost,
  normalizeHost,
} from "@/lib/site-domains";
import { LandingNav } from "@/components/landing/nav";
import { HeroSection } from "@/components/landing/hero";
import { WhoIsThisFor } from "@/components/landing/who-is-this-for";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturesGrid } from "@/components/landing/features";
import { CtaSection } from "@/components/landing/cta-section";
import { HonestReviews } from "@/components/landing/honest-reviews";
import { SmmAgentHome } from "@/components/landing/smm-home";

function isLocalHost(host: string | null) {
  return host === "localhost" || host === "127.0.0.1";
}

async function getRequestHost() {
  const h = await headers();
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}

function previewImage(url: string) {
  return {
    url,
    width: 1200,
    height: 630,
    alt: "SMM Agent dashboard preview",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = getSmmAgentCanonicalUrl("/");
  const previewUrl = getSmmAgentCanonicalUrl("/opengraph-image");

  return {
    title: "AI Social Media Agent for Operators — SMM Agent",
    description:
      "SMM Agent is the agent-focused surface for source-backed drafts, reply queues, model keys, schedules, and approval-aware publishing.",
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: "AI Social Media Agent for Operators — SMM Agent",
      description:
        "An agent operating layer for social posts, replies, approvals, and platform-specific distribution.",
      url: canonicalUrl,
      siteName: "SMM Agent",
      images: [previewImage(previewUrl)],
    },
    twitter: {
      card: "summary_large_image",
      title: "AI Social Media Agent for Operators — SMM Agent",
      description:
        "An agent operating layer for social posts, replies, approvals, and platform-specific distribution.",
      images: [previewUrl],
    },
  };
}

export default async function HomePage() {
  const host = await getRequestHost();
  const session = await getSession();

  if (isPublicMarketingHost(host)) {
    return (
      <>
        <LandingNav isLoggedIn={!!session} brandName="SMM Agent" accessMode="login" />
        <SmmAgentHome isLoggedIn={!!session} />
      </>
    );
  }

  if (!isLocalHost(host)) {
    redirect(session ? "/dashboard" : "/login");
  }

  return (
    <>
      <LandingNav isLoggedIn={!!session} />
      <HeroSection />
      <WhoIsThisFor />
      <HowItWorks />
      <FeaturesGrid />
      <div className="container">
        <HonestReviews />
      </div>
      <CtaSection />
    </>
  );
}
