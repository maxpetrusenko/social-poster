import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { SITE_DOMAINS, getProductCanonicalUrl, getSmmAgentCanonicalUrl, getSmmCanonicalUrl, normalizeHost } from "@/lib/site-domains";
import { LandingNav } from "@/components/landing/nav";
import { HeroSection } from "@/components/landing/hero";
import { WhoIsThisFor } from "@/components/landing/who-is-this-for";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturesGrid } from "@/components/landing/features";
import { CtaSection } from "@/components/landing/cta-section";
import { LandingFooter } from "@/components/landing/footer";
import { SmmAgentHome, SmmHome } from "@/components/landing/smm-home";

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
  const host = await getRequestHost();

  if (host === SITE_DOMAINS.smm) {
    const canonicalUrl = getSmmCanonicalUrl("/");
    const previewUrl = getSmmCanonicalUrl("/opengraph-image");

    return {
      title: "Social Media Automation for Agencies — SMMClaw",
      description:
        "SMMClaw is a ClawPoster-powered social media automation surface for agencies, lean teams, and operators managing multiple brands.",
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title: "Social Media Automation for Agencies — SMMClaw",
        description:
          "A ClawPoster-powered workflow for agencies and lean teams that need more client-ready social output without more headcount.",
        url: canonicalUrl,
        siteName: "SMMClaw",
        images: [previewImage(previewUrl)],
      },
      twitter: {
        card: "summary_large_image",
        title: "Social Media Automation for Agencies — SMMClaw",
        description:
          "A ClawPoster-powered workflow for agencies and lean teams that need more client-ready social output without more headcount.",
        images: [previewUrl],
      },
    };
  }

  if (host === SITE_DOMAINS.smmAgent) {
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

  const canonicalUrl = getProductCanonicalUrl("/");
  const previewUrl = getProductCanonicalUrl("/opengraph-image");

  return {
    title: "SMM Agent — Social Media Management",
    description:
      "SMM Agent helps teams create, schedule, publish, and monitor social content from one dashboard.",
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: "SMM Agent — Social Media Management",
      description:
        "Create, schedule, publish, and monitor social content from one workspace.",
      url: canonicalUrl,
      siteName: "SMM Agent",
      images: [previewImage(previewUrl)],
    },
    twitter: {
      card: "summary_large_image",
      title: "SMM Agent — Social Media Management",
      description:
        "Create, schedule, publish, and monitor social content from one workspace.",
      images: [previewUrl],
    },
  };
}

export default async function HomePage() {
  const host = await getRequestHost();
  const session = await getSession();

  if (host === SITE_DOMAINS.app) {
    redirect(session ? "/dashboard" : "/login");
  }

  if (host === SITE_DOMAINS.smm) {
    return (
      <>
        <LandingNav isLoggedIn={!!session} brandName="SMMClaw" />
        <SmmHome />
        <LandingFooter brandName="SMMClaw" />
      </>
    );
  }

  if (host === SITE_DOMAINS.smmAgent) {
    return (
      <>
        <LandingNav isLoggedIn={!!session} brandName="SMM Agent" />
        <SmmAgentHome />
        <LandingFooter brandName="SMM Agent" />
      </>
    );
  }

  if (host !== SITE_DOMAINS.product && !isLocalHost(host)) {
    redirect(session ? "/dashboard" : "/login");
  }

  return (
    <>
      <LandingNav isLoggedIn={!!session} />
      <HeroSection />
      <WhoIsThisFor />
      <HowItWorks />
      <FeaturesGrid />
      <CtaSection />
      <LandingFooter />
    </>
  );
}
