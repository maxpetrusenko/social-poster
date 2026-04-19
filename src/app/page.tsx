import { getSession } from "@/lib/auth";
import { LandingNav } from "@/components/landing/nav";
import { HeroSection } from "@/components/landing/hero";
import { WhoIsThisFor } from "@/components/landing/who-is-this-for";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturesGrid } from "@/components/landing/features";
import { CtaSection } from "@/components/landing/cta-section";
import { LandingFooter } from "@/components/landing/footer";

export default async function HomePage() {
  const session = await getSession();

  // If ?app query param, redirect to dashboard
  if (session) {
    // Still show landing page even if logged in — dashboard is at /dashboard
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
