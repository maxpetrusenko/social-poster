import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { LandingNav } from "@/components/landing/nav";
import { HeroSection } from "@/components/landing/hero";
import { WhoIsThisFor } from "@/components/landing/who-is-this-for";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturesGrid } from "@/components/landing/features";
import { CtaSection } from "@/components/landing/cta-section";
import { LandingFooter } from "@/components/landing/footer";

const LANDING_DOMAINS = ["clawposter.app", "smmclaw.app", "localhost"];

export default async function HomePage() {
  const h = await headers();
  const host = (h.get("host") || "").replace(/:\d+$/, "");
  const session = await getSession();

  // social.maxpetrusenko.com = real app, redirect to dashboard/login
  if (!LANDING_DOMAINS.some((d) => host.includes(d))) {
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
