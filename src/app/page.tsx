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

export async function generateMetadata(): Promise<Metadata> {
  const host = await getRequestHost();

  if (host === SITE_DOMAINS.smm) {
    return {
      title: "Social Media Automation for Agencies — SMMClaw",
      description:
        "SMMClaw is a ClawPoster-powered social media automation surface for agencies, lean teams, and operators managing multiple brands.",
      alternates: {
        canonical: getSmmCanonicalUrl("/"),
      },
      openGraph: {
        title: "Social Media Automation for Agencies — SMMClaw",
        description:
          "A ClawPoster-powered workflow for agencies and lean teams that need more client-ready social output without more headcount.",
        url: getSmmCanonicalUrl("/"),
        siteName: "SMMClaw",
      },
    };
  }

  if (host === SITE_DOMAINS.smmAgent) {
    return {
      title: "AI Social Media Agent for Operators — SMMAgent",
      description:
        "SMMAgent is the agent-focused surface for source-backed drafts, reply queues, model keys, schedules, and approval-aware publishing.",
      alternates: {
        canonical: getSmmAgentCanonicalUrl("/"),
      },
      openGraph: {
        title: "AI Social Media Agent for Operators — SMMAgent",
        description:
          "An agent operating layer for social posts, replies, approvals, and platform-specific distribution.",
        url: getSmmAgentCanonicalUrl("/"),
        siteName: "SMMAgent",
      },
    };
  }

  return {
    title: "ClawPoster — AI Social Posting Agent",
    description:
      "Your AI agent for social posting. Writes your posts, adapts per platform, and publishes while you build.",
    alternates: {
      canonical: getProductCanonicalUrl("/"),
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
        <LandingNav isLoggedIn={!!session} brandName="SMMAgent" />
        <SmmAgentHome />
        <LandingFooter brandName="SMMAgent" />
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
